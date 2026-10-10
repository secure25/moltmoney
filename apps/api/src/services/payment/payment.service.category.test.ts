import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentService } from './payment.service';
import { AccountService } from '../account/account.service';
import { MockPaymentProvider } from '../../providers/mock-payment-provider';
import Decimal from 'decimal.js';

const { PrismaClient } = require('@prisma/client');

/**
 * Blocked-category hard-prohibition tests (policy decision: blocked category
 * = hard stop, never owner approval; missing category on the PayPal checkout
 * path = hard reject when blocked categories are configured).
 *
 * Uses the MockPaymentProvider against the isolated test database
 * (run vitest with DATABASE_URL pointing at moltmoney_test) — no live
 * PayPal calls, no live data.
 */
describe('PaymentService - blocked category hard prohibition', () => {
  let prisma: any;
  let paymentService: PaymentService;
  let accountService: AccountService;
  let paymentProvider: MockPaymentProvider;
  let testOwnerId: string;
  let accountId: string;
  let createOrderSpy: any;

  beforeEach(async () => {
    prisma = new PrismaClient();
    paymentProvider = new MockPaymentProvider();
    paymentService = new PaymentService(prisma, paymentProvider, undefined, undefined);
    accountService = new AccountService(prisma, undefined);

    const owner = await prisma.owner.create({
      data: {
        email: `test-${Date.now()}-${Math.random()}@example.com`,
        name: 'Test Owner',
        password: 'hashed_password',
      },
    });
    testOwnerId = owner.id;

    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Category Agent',
      'OpenClaw'
    );
    accountId = account.id;
    await accountService.fundAccount(accountId, new Decimal('100.00'));

    createOrderSpy = vi.spyOn(paymentProvider, 'createOrder');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.paymentRequest.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.providerWebhookEvent.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.virtualCard.deleteMany({});
    await prisma.externalBankAccount.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({ where: { ownerId: testOwnerId } });
    await prisma.owner.delete({ where: { id: testOwnerId } });
    await prisma.$disconnect();
  });

  async function setBlockedRules(extra: Record<string, unknown> = {}) {
    await accountService.updateSpendingRules(accountId, {
      blockedCategories: ['gambling', 'alcohol', 'dangerous goods'],
      ...extra,
    });
  }

  async function countTransactions(): Promise<number> {
    // Exclude the INBOUND funding transaction created by fundAccount setup.
    return prisma.transaction.count({
      where: { fromAccountId: accountId, type: { not: 'INBOUND' } },
    });
  }

  describe('createCheckoutOrder hard rejects', () => {
    it('hard-rejects a $5 alcohol purchase: no transaction, no provider call, no approval flow', async () => {
      await setBlockedRules();

      await expect(
        paymentService.createCheckoutOrder(accountId, new Decimal('5.00'), {
          merchantName: 'Liquor Store',
          merchantCategory: 'alcohol',
        })
      ).rejects.toThrow(/Spending rule violation.*category blocked/i);

      expect(await countTransactions()).toBe(0);
      expect(createOrderSpy).not.toHaveBeenCalled();
    });

    it('hard-rejects a $20 alcohol purchase instead of routing to owner approval', async () => {
      await setBlockedRules();

      await expect(
        paymentService.createCheckoutOrder(accountId, new Decimal('20.00'), {
          merchantName: 'Liquor Store',
          merchantCategory: 'alcohol',
        })
      ).rejects.toThrow(/Spending rule violation.*category blocked/i);

      // Rejected outright — it is NOT a pending owner-approval transaction.
      expect(await countTransactions()).toBe(0);
      const pending = await prisma.transaction.findMany({ where: { fromAccountId: accountId } });
      expect(pending.filter((t: any) => t.approvalRequired)).toHaveLength(0);
      expect(createOrderSpy).not.toHaveBeenCalled();
    });

    it('hard-rejects a missing merchantCategory when blocked categories are configured', async () => {
      await setBlockedRules();

      await expect(
        paymentService.createCheckoutOrder(accountId, new Decimal('5.00'), {
          merchantName: 'Some Store',
        })
      ).rejects.toThrow(/merchantCategory is required/);

      await expect(
        paymentService.createCheckoutOrder(accountId, new Decimal('5.00'), {
          merchantName: 'Some Store',
          merchantCategory: '   ',
        })
      ).rejects.toThrow(/merchantCategory is required/);

      expect(await countTransactions()).toBe(0);
      expect(createOrderSpy).not.toHaveBeenCalled();
    });

    it('blocked category takes precedence over monetary approval rules', async () => {
      // Per-transaction limit would ALSO be exceeded, but the blocked category
      // decides: hard rejection, not approval.
      await setBlockedRules({ perTransactionLimit: '10.00' });

      await expect(
        paymentService.createCheckoutOrder(accountId, new Decimal('20.00'), {
          merchantName: 'Casino',
          merchantCategory: 'gambling',
        })
      ).rejects.toThrow(/category blocked/i);

      expect(await countTransactions()).toBe(0);
      expect(createOrderSpy).not.toHaveBeenCalled();
    });

    it('persists the declared category on the created transaction', async () => {
      // No blocked categories configured: category is optional and persisted.
      const res = await paymentService.createCheckoutOrder(accountId, new Decimal('5.00'), {
        merchantName: 'Book Store',
        merchantCategory: 'books',
      });
      expect(res.transaction.merchantCategory).toBe('books');
    });
  });

  describe('monetary limits remain soft (approval-required)', () => {
    it('keeps the existing approval flow for an allowed category over the per-transaction limit', async () => {
      await accountService.updateSpendingRules(accountId, {
        perTransactionLimit: '10.00',
      });

      const res = await paymentService.createCheckoutOrder(accountId, new Decimal('20.00'), {
        merchantName: 'Electronics Store',
        merchantCategory: 'electronics',
      });

      // Order WAS created (soft rule): pending + owner approval required.
      expect(res.transaction.status).toBe('PENDING');
      expect(res.transaction.approvalRequired).toBe(true);
      expect(createOrderSpy).toHaveBeenCalledTimes(1);

      // Capture is blocked until the owner approves...
      await expect(paymentService.captureCheckoutOrder(res.transaction.id)).rejects.toThrow(
        /Owner approval is required/
      );

      // ...then approval unlocks capture (existing soft flow intact).
      await paymentService.approvePayment(res.transaction.id, testOwnerId);
      const completed = await paymentService.captureCheckoutOrder(res.transaction.id);
      expect(completed.status).toBe('COMPLETED');
    });
  });

  describe('capture-time category re-check (defense-in-depth)', () => {
    it('refuses to capture an order whose persisted category is now blocked', async () => {
      const res = await paymentService.createCheckoutOrder(accountId, new Decimal('5.00'), {
        merchantName: 'Corner Store',
        merchantCategory: 'groceries',
      });

      // Rules change after order creation: the declared category gets blocked.
      await accountService.updateSpendingRules(accountId, {
        blockedCategories: ['groceries'],
      });

      await expect(paymentService.captureCheckoutOrder(res.transaction.id)).rejects.toThrow(
        /capture-time re-check/
      );
      expect(createOrderSpy).toHaveBeenCalledTimes(1);
    });

    it('refuses to capture an uncategorized order once blocked categories are configured', async () => {
      const res = await paymentService.createCheckoutOrder(accountId, new Decimal('5.00'), {
        merchantName: 'Legacy Store',
      });
      expect(res.transaction.merchantCategory).toBeNull();

      await setBlockedRules();

      await expect(paymentService.captureCheckoutOrder(res.transaction.id)).rejects.toThrow(
        /uncategorized order/
      );
    });

    it('still captures normally when no blocked categories are configured', async () => {
      const res = await paymentService.createCheckoutOrder(accountId, new Decimal('5.00'), {
        merchantName: 'Book Store',
        merchantCategory: 'books',
      });

      const completed = await paymentService.captureCheckoutOrder(res.transaction.id);
      expect(completed.status).toBe('COMPLETED');
    });
  });

  describe('sendPayment consistency', () => {
    it('hard-rejects an internal send in a blocked category (never owner approval)', async () => {
      await setBlockedRules();
      const { account: recipient } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      await expect(
        paymentService.sendPayment(
          accountId,
          recipient.id,
          new Decimal('5.00'),
          'Casino payment',
          'Casino',
          'gambling'
        )
      ).rejects.toThrow(/Spending rule violation/);

      expect(await countTransactions()).toBe(0);
    });
  });
});
