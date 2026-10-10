import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PaymentService } from './payment.service';
import { AccountService } from '../account/account.service';
import { MockPaymentProvider } from '../../providers/mock-payment-provider';
import { WebhookEvent } from '../../providers/payment-provider.interface';
import { WebhookEventType } from '@moltmoney/shared';
import Decimal from 'decimal.js';

const { PrismaClient } = require('@prisma/client');

/**
 * PayPal checkout flow state machine + idempotency tests (Phases 6, 8, 10).
 * Uses the MockPaymentProvider against the real local database (mocked HTTP
 * only — no live PayPal credentials required).
 */

describe('PaymentService - PayPal checkout flow', () => {
  let prisma: any;
  let paymentService: PaymentService;
  let accountService: AccountService;
  let paymentProvider: MockPaymentProvider;
  let testOwnerId: string;
  let accountId: string;

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
      'Checkout Agent',
      'OpenClaw'
    );
    accountId = account.id;
    await accountService.fundAccount(accountId, new Decimal('100.00'));
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

  function captureCompletedEvent(resource: any): WebhookEvent {
    return {
      type: WebhookEventType.PAYMENT_COMPLETED,
      data: { category: 'capture_completed', eventType: 'PAYMENT.CAPTURE.COMPLETED', resource },
      timestamp: new Date(),
    };
  }

  describe('createCheckoutOrder (Phase 5/6)', () => {
    it('creates a PENDING transaction and returns the approval URL without completing anything', async () => {
      const res = await paymentService.createCheckoutOrder(accountId, new Decimal('25.00'), {
        merchantName: 'OpenAI',
      });

      expect(res.orderId).toMatch(/^MOCK-ORDER-/);
      expect(res.approvalUrl).toContain('checkoutnow');
      expect(res.transaction.status).toBe('PENDING');
      expect(res.transaction.providerName).toBe('paypal');
      expect(res.transaction.providerRefId).toBe(res.orderId);
      expect(res.transaction.providerMetadata.state).toBe('WAITING_FOR_PAYER_APPROVAL');
    });

    it('routes rule-violating amounts into the owner-approval flow', async () => {
      // Existing convention: spending-rule violations require owner approval
      // rather than rejecting the request.
      await accountService.updateSpendingRules(accountId, {
        perTransactionLimit: '10.00',
      });

      const res = await paymentService.createCheckoutOrder(accountId, new Decimal('50.00'));
      expect(res.transaction.approvalRequired).toBe(true);

      await expect(paymentService.captureCheckoutOrder(res.transaction.id)).rejects.toThrow(
        /Owner approval is required/
      );
    });

    it('rejects insufficient balance before creating any provider order', async () => {
      await expect(
        paymentService.createCheckoutOrder(accountId, new Decimal('500.00'))
      ).rejects.toThrow(/Insufficient balance/);
    });

    it('never deducts the balance at order creation', async () => {
      await paymentService.createCheckoutOrder(accountId, new Decimal('25.00'));
      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('100');
    });
  });

  describe('captureCheckoutOrder (Phase 6/8)', () => {
    it('moves PENDING -> COMPLETED, deducts balance, and persists capture references', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );

      const completed = await paymentService.captureCheckoutOrder(transaction.id);

      expect(completed.status).toBe('COMPLETED');
      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('75');
      expect(completed.providerMetadata.captureId).toBeTruthy();
      expect(completed.providerMetadata.state).toBe('CAPTURED');
    });

    it('is idempotent: recapturing an already-captured order does not double-deduct', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );

      const first = await paymentService.captureCheckoutOrder(transaction.id);
      const second = await paymentService.captureCheckoutOrder(transaction.id);

      expect(second.status).toBe('COMPLETED');
      expect(second.id).toBe(first.id);
      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('75');
    });

    it('blocks capture until owner approval when approvalRequired is set', async () => {
      await accountService.updateSpendingRules(accountId, {
        requireApprovalAbove: '10.00',
      });

      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );
      expect(transaction.approvalRequired).toBe(true);

      await expect(paymentService.captureCheckoutOrder(transaction.id)).rejects.toThrow(
        /Owner approval is required/
      );

      // Owner approval unlocks capture (and still does not deduct directly)
      await paymentService.approvePayment(transaction.id, testOwnerId);
      const refreshed = await prisma.transaction.findUnique({ where: { id: transaction.id } });
      expect(refreshed.approvedAt).toBeTruthy();

      const completed = await paymentService.captureCheckoutOrder(transaction.id);
      expect(completed.status).toBe('COMPLETED');
      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('75');
    });

    it('fails atomically when the balance became insufficient before completion', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );

      // Drain the account so the capture can no longer be funded
      await prisma.account.update({
        where: { id: accountId },
        data: { balance: '10.00' },
      });

      await expect(paymentService.captureCheckoutOrder(transaction.id)).rejects.toThrow(
        /Insufficient balance for capture/
      );

      const refreshed = await prisma.transaction.findUnique({ where: { id: transaction.id } });
      expect(refreshed.status).not.toBe('COMPLETED');
      const account = await prisma.account.findUnique({ where: { id: accountId } });
      expect(new Decimal(account.balance.toString()).toString()).toBe('10');
    });
  });

  describe('handleProviderWebhook (Phase 7)', () => {
    it('completes a payment from a valid capture-completed webhook exactly once', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );

      const event = captureCompletedEvent({ id: 'CAP-WEB-1', custom_id: transaction.id });
      const res1 = await paymentService.handleProviderWebhook(event);
      const res2 = await paymentService.handleProviderWebhook(event);

      expect(res1.status).toBe('processed');
      expect(res2.status).toBe('already_processed');

      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('75');
      const txs = await prisma.transaction.findMany({ where: { fromAccountId: accountId } });
      // The funding row is also COMPLETED, so filter to the checkout (OUTBOUND) tx
      expect(txs.filter((t: any) => t.status === 'COMPLETED' && t.type === 'OUTBOUND')).toHaveLength(1);
    });

    it('records payer approval without completing the payment', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );

      const res = await paymentService.handleProviderWebhook({
        type: WebhookEventType.PAYMENT_APPROVED,
        data: {
          category: 'order_approved',
          eventType: 'CHECKOUT.ORDER.APPROVED',
          resource: { id: transaction.providerRefId },
        },
        timestamp: new Date(),
      });

      expect(res.status).toBe('processed');
      const refreshed = await prisma.transaction.findUnique({ where: { id: transaction.id } });
      expect(refreshed.status).toBe('APPROVED');
      expect(refreshed.providerMetadata.state).toBe('APPROVED');

      // Approval alone must NOT move money
      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('100');
    });

    it('marks a capture-denied webhook as DECLINED without moving money', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );

      const res = await paymentService.handleProviderWebhook({
        type: WebhookEventType.PAYMENT_DECLINED,
        data: {
          category: 'capture_declined',
          eventType: 'PAYMENT.CAPTURE.DENIED',
          resource: { id: 'CAP-DENIED-1', custom_id: transaction.id },
        },
        timestamp: new Date(),
      });

      expect(res.status).toBe('processed');
      const refreshed = await prisma.transaction.findUnique({ where: { id: transaction.id } });
      expect(refreshed.status).toBe('DECLINED');
      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('100');

      // Further capture attempts are refused
      await expect(paymentService.captureCheckoutOrder(transaction.id)).rejects.toThrow(
        /Cannot capture transaction in DECLINED/
      );
    });

    it('ignores events for unknown transactions and unknown categories', async () => {
      const res = await paymentService.handleProviderWebhook(
        captureCompletedEvent({ id: 'CAP-UNKNOWN', custom_id: 'no-such-tx' })
      );
      expect(res.status).toBe('ignored');

      const res2 = await paymentService.handleProviderWebhook({
        type: WebhookEventType.PAYMENT_COMPLETED,
        data: { category: undefined, resource: {} },
        timestamp: new Date(),
      });
      expect(res2.status).toBe('ignored');
    });

    it('reconciles a capture-completed webhook after a crash between capture and DB update', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );

      // Simulate capture succeeding but the DB update failing: the capture
      // response is lost, and later the webhook arrives with the capture id.
      // A retry through captureCheckoutOrder would capture again (the mock
      // mints a new capture id per call), so reconcile purely from the event.
      const res = await paymentService.handleProviderWebhook(
        captureCompletedEvent({ id: 'CAP-CRASH-1', custom_id: transaction.id })
      );

      expect(res.status).toBe('processed');
      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('75');
    });
  });

  describe('refundTransaction (Phase 10)', () => {
    it('issues a full refund crediting the sender exactly once', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );
      const completed = await paymentService.captureCheckoutOrder(transaction.id);
      const captureId = completed.providerMetadata.captureId;

      const { transaction: refundTx, refundId } = await paymentService.refundTransaction(
        transaction.id
      );

      expect(refundId).toBeTruthy();
      expect(refundTx.type).toBe('INBOUND');
      expect(refundTx.status).toBe('COMPLETED');
      expect(new Decimal(refundTx.amount.toString()).toString()).toBe('25');
      expect(refundTx.providerRefId).toBe(refundId);
      expect(refundTx.providerMetadata.captureId).toBe(captureId);

      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('100');
    });

    it('supports a partial refund without breaking the RefundResponse contract', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );
      await paymentService.captureCheckoutOrder(transaction.id);

      const { transaction: refundTx, refundId } = await paymentService.refundTransaction(
        transaction.id,
        new Decimal('10.00')
      );

      expect(refundId).toBeTruthy();
      expect(new Decimal(refundTx.amount.toString()).toString()).toBe('10');
      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('85');
    });

    it('rejects refunds exceeding the original amount and cumulative over-refunds', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );
      await paymentService.captureCheckoutOrder(transaction.id);

      await expect(
        paymentService.refundTransaction(transaction.id, new Decimal('30.00'))
      ).rejects.toThrow(/exceeds the original/);

      await paymentService.refundTransaction(transaction.id, new Decimal('20.00'));
      await expect(
        paymentService.refundTransaction(transaction.id, new Decimal('10.00'))
      ).rejects.toThrow(/exceeds the original/);
    });

    it('reconciles a capture-refunded webhook using the capture id in providerMetadata', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );
      const completed = await paymentService.captureCheckoutOrder(transaction.id);
      const captureId = completed.providerMetadata.captureId as string;

      const res = await paymentService.handleProviderWebhook({
        type: WebhookEventType.PAYMENT_REFUNDED,
        data: {
          category: 'capture_refunded',
          eventType: 'PAYMENT.CAPTURE.REFUNDED',
          resource: {
            id: 'REF-WH-1',
            amount: { value: '25.00', currency_code: 'USD' },
            links: [{ rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}` }],
          },
        },
        timestamp: new Date(),
      });

      expect(res.status).toBe('processed');
      const account = await accountService.getAccount(accountId);
      expect(new Decimal(account.balance.toString()).toString()).toBe('100');
      const refundTx = await prisma.transaction.findFirst({
        where: { providerRefId: 'REF-WH-1' },
      });
      expect(refundTx).toBeTruthy();
      expect(refundTx.type).toBe('INBOUND');
    });

    it('rejects refunds of non-completed transactions', async () => {
      const { transaction } = await paymentService.createCheckoutOrder(
        accountId,
        new Decimal('25.00')
      );

      await expect(paymentService.refundTransaction(transaction.id)).rejects.toThrow(
        /non-completed/
      );
    });
  });
});
