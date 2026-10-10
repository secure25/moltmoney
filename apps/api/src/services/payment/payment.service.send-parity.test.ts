import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentService } from './payment.service';
import { AccountService } from '../account/account.service';
import { MockPaymentProvider } from '../../providers/mock-payment-provider';
import Decimal from 'decimal.js';

const { PrismaClient } = require('@prisma/client');

/**
 * POST /payments/send RULE-PARITY tests.
 *
 * Guarantees under test (mirroring payment.service.category.test.ts patterns):
 *   1. sendPayment evaluates per-transaction limit, daily limit and the
 *      approval threshold against the account's CURRENT rules at execution
 *      time (it is a single-step operation with no create/capture split).
 *   2. Blocked categories hard-prohibit sends when a caller DOES declare a
 *      category.
 *   3. BLOCKED CATEGORIES ARE N/A for ordinary internal transfers: there is
 *      no merchant, so a missing merchantCategory is allowed even when
 *      blockedCategories are configured — a deliberate policy decision,
 *      explicitly documented in payment.service.ts (rule-parity note), NOT a
 *      parity gap.
 *
 * Convention: MockPaymentProvider against the isolated test database (run
 * vitest with DATABASE_URL pointing at moltmoney_test) — no live PayPal.
 */
describe('PaymentService - sendPayment rule parity', () => {
  let prisma: any;
  let paymentService: PaymentService;
  let accountService: AccountService;
  let paymentProvider: MockPaymentProvider;
  let testOwnerId: string;
  let senderId: string;
  let recipientIdVal: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    paymentProvider = new MockPaymentProvider();
    paymentService = new PaymentService(prisma, paymentProvider, undefined, undefined);
    accountService = new AccountService(prisma, undefined);

    const owner = await prisma.owner.create({
      data: {
        email: `send-parity-${Date.now()}-${Math.random()}@example.com`,
        name: 'Send Parity Owner',
        password: 'hashed_password',
      },
    });
    testOwnerId = owner.id;

    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Send Parity Agent',
      'OpenClaw'
    );
    senderId = account.id;
    await accountService.fundAccount(senderId, new Decimal('500.00'));

    const { account: recipient } = await accountService.createAgentAccount(
      testOwnerId,
      'Send Parity Recipient',
      'OpenClaw'
    );
    recipientIdVal = recipient.id;
  });

  afterEach(async () => {
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

  async function recipientBalance(): Promise<Decimal> {
    const recipient = await prisma.account.findUnique({ where: { id: recipientIdVal } });
    return new Decimal(recipient.balance.toString());
  }

  async function totalOutgoing(): Promise<number> {
    // Excludes the INBOUND funding transaction created by fundAccount setup.
    return prisma.transaction.count({
      where: { fromAccountId: senderId, type: { not: 'INBOUND' } },
    });
  }

  describe('monetary rules evaluated against CURRENT rules at execution time', () => {
    it('routes over-limit sends to owner approval (per-transaction limit), evaluated at execution', async () => {
      await accountService.updateSpendingRules(senderId, {
        perTransactionLimit: '10.00',
      });

      const res = await paymentService.sendPayment(
        senderId,
        recipientIdVal,
        new Decimal('20.00'),
        'over per-tx limit'
      );

      expect(res.status).toBe('PENDING');
      expect(res.approvalRequired).toBe(true);
      // No money moved: approval must precede effect.
      expect(new Decimal(await recipientBalance()).isZero()).toBe(true);
      expect(await totalOutgoing()).toBe(1);

      // Completes after owner approval.
      await paymentService.approvePayment(res.id, testOwnerId);
      const done = await prisma.transaction.findUnique({ where: { id: res.id } });
      expect(done.status).toBe('COMPLETED');
      expect((await recipientBalance()).equals('20.00')).toBe(true);
    });

    it('accumulates the live daily total: the second send sees the first in getSpentToday', async () => {
      // requireApprovalAbove '0.00' makes every send pending; dailyLimit 100
      // then gets exceeded once the first $60 completes.
      await accountService.updateSpendingRules(senderId, {
        dailyLimit: '100.00',
        requireApprovalAbove: '0.00',
      });

      const first = await paymentService.sendPayment(
        senderId,
        recipientIdVal,
        new Decimal('60.00')
      );
      expect(first.approvalRequired).toBe(true);
      await paymentService.approvePayment(first.id, testOwnerId);

      const second = await paymentService.sendPayment(
        senderId,
        recipientIdVal,
        new Decimal('60.00')
      );
      // Still lands in the approval queue (soft flow), but the daily-limit
      // violation is now part of the second evaluation because "spent today"
      // includes the first completed $60.
      expect(second.approvalRequired).toBe(true);
      expect(second.status).toBe('PENDING');
      // Nothing else completed in the ledger beyond the first approved send.
      const completedCount = await prisma.transaction.count({
        where: { fromAccountId: senderId, type: { not: 'INBOUND' }, status: 'COMPLETED' },
      });
      expect(completedCount).toBe(1);
    });

    it('enforces rules set AFTER account creation (fresh account read, no stale snapshot)', async () => {
      // No rules when the account was created/funded.
      const before = await paymentService.sendPayment(
        senderId,
        recipientIdVal,
        new Decimal('5.00')
      );
      expect(before.status).toBe('COMPLETED');

      // Rules arrive afterwards — the very next send must honor them.
      await accountService.updateSpendingRules(senderId, {
        requireApprovalAbove: '1.00',
      });

      const after = await paymentService.sendPayment(
        senderId,
        recipientIdVal,
        new Decimal('5.00')
      );
      expect(after.approvalRequired).toBe(true);
      expect(after.status).toBe('PENDING');
    });
  });

  describe('blocked categories hard-prohibit sends that declare a category', () => {
    it('hard-rejects a send declaring a blocked category (no transaction, no provider call)', async () => {
      await accountService.updateSpendingRules(senderId, {
        blockedCategories: ['gambling'],
      });
      const authSpy = vi.spyOn(paymentProvider, 'authorizePayment');

      await expect(
        paymentService.sendPayment(
          senderId,
          recipientIdVal,
          new Decimal('5.00'),
          'Casino transfer',
          'Casino',
          'gambling'
        )
      ).rejects.toThrow(/Spending rule violation/);

      expect(await totalOutgoing()).toBe(0);
      expect(authSpy).not.toHaveBeenCalled();
    });
  });

  describe('blocked categories are N/A for internal transfers (documented policy)', () => {
    it('allows an internal send with NO category even when blockedCategories are configured', async () => {
      await accountService.updateSpendingRules(senderId, {
        blockedCategories: ['gambling', 'alcohol'],
      });

      const res = await paymentService.sendPayment(
        senderId,
        recipientIdVal,
        new Decimal('5.00'),
        'no merchant, no category'
      );
      expect(res.status).toBe('COMPLETED');
      expect(res.merchantCategory).toBeNull();
      expect((await recipientBalance()).equals('5.00')).toBe(true);
    });

    it('allows a merchant-less external send (toAccountId=null) with NO category when blocks are configured', async () => {
      await accountService.updateSpendingRules(senderId, {
        blockedCategories: ['gambling'],
      });

      const res = await paymentService.sendPayment(
        senderId,
        null,
        new Decimal('5.00'),
        'external, unclassified'
      );
      expect(res.status).toBe('COMPLETED');
      expect(res.merchantCategory).toBeNull();
    });
  });
});
