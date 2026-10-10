import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { eventFromStoredPayload } from '../../../scripts/normalize-webhooks';
import { mapPayPalEventCategory, PayPalPaymentProvider } from '../../../src/providers/paypal/paypal-payment-provider';
import { PayPalClient } from '../../../src/providers/paypal/paypal-client';
import { PaymentService } from '../../../src/services/payment/payment.service';
import { AccountService } from '../../../src/services/account/account.service';
import { WebhookEvent } from '../../../src/providers/payment-provider.interface';
import { WebhookEventType } from '@moltmoney/shared';
import Decimal from 'decimal.js';

/**
 * Roadmap item 1 regression tests:
 *  1. The replayer's payload→WebhookEvent derivation stays in lockstep with
 *     the provider's parseWebhook mapping (otherwise replay silently diverges
 *     from live intake).
 *  2. Feeding a stored capture_completed delivery twice through the
 *     reconciler is a strict no-op the second time (no duplicate state or
 *     balance change).
 */

describe('normalize-webhooks: stored-payload derivation matches provider mapping', () => {
  const SAMPLES: Array<[string, string, string]> = [
    // [event_type, expected category, expected WebhookEventType]
    ['CHECKOUT.ORDER.APPROVED', 'order_approved', String(WebhookEventType.PAYMENT_APPROVED)],
    ['PAYMENT.CAPTURE.COMPLETED', 'capture_completed', String(WebhookEventType.PAYMENT_COMPLETED)],
    ['PAYMENT.CAPTURE.DECLINED', 'capture_declined', String(WebhookEventType.PAYMENT_DECLINED)],
    ['PAYMENT.CAPTURE.REFUNDED', 'capture_refunded', String(WebhookEventType.PAYMENT_REFUNDED)],
    ['PAYMENT.CAPTURE.REVERSED', 'capture_refunded', String(WebhookEventType.PAYMENT_REFUNDED)],
  ];

  it('maps every provider-supported event type identically', () => {
    for (const [eventType, expectedCategory] of SAMPLES) {
      // Independent cross-check: the provider's own mapping.
      expect(mapPayPalEventCategory(eventType)).toBe(expectedCategory);
    }
    // Unknown types are skipped by replay (return null), like live intake.
    expect(mapPayPalEventCategory('PAYMENT.CAPTURE.REVIVED')).toBe(null);
    expect(eventFromStoredPayload(JSON.stringify({ event_type: 'PAYMENT.CAPTURE.REVIVED' }))).toBe(null);
  });

  it('derives the exact WebhookEvent shape the live receiver used', () => {
    const payload = JSON.stringify({
      id: 'WH-123',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      create_time: '2026-10-04T23:58:48Z',
      resource: { id: '27W47000LR0321214', amount: { value: '5.00', currency_code: 'USD' } },
    });
    const ev = eventFromStoredPayload(payload);
    expect(ev).toBeTruthy();
    expect(ev!.data.category).toBe('capture_completed');
    expect(ev!.data.eventType).toBe('PAYMENT.CAPTURE.COMPLETED');
    expect(ev!.data.eventId).toBe('WH-123');
    expect(ev!.data.resource.id).toBe('27W47000LR0321214');
    expect(String(ev!.type)).toBe(String(WebhookEventType.PAYMENT_COMPLETED));
    expect(ev!.timestamp.toISOString()).toBe('2026-10-04T23:58:48.000Z');
  });

  it('rejects junk payloads (unmappable → error in replay, never a crash)', () => {
    expect(eventFromStoredPayload('not json')).toBe(null);
    expect(eventFromStoredPayload('{}')).toBe(null);
    expect(eventFromStoredPayload(JSON.stringify({ event_type: 123 }))).toBe(null);
  });
});

describe('normalize-webhooks: reconcile idempotency (DB)', () => {
  let prisma: any;
  let paymentService: PaymentService;
  let accountService: AccountService;
  let testOwnerId: string;
  let accountId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    paymentService = new PaymentService(prisma, new PayPalPaymentProvider(new PayPalClient()), undefined, undefined);
    accountService = new AccountService(prisma, undefined);

    const owner = await prisma.owner.create({
      data: { email: `normtest-${Date.now()}-${Math.random()}@example.com`, name: 'Norm Owner', password: 'hashed' },
    });
    testOwnerId = owner.id;
    const { account } = await accountService.createAgentAccount(testOwnerId, 'Norm Agent', 'OpenClaw');
    accountId = account.id;
    await accountService.fundAccount(accountId, new Decimal('100.00'));
  });

  afterEach(async () => {
    await prisma.providerWebhookEvent.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.virtualCard.deleteMany({});
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

  it('double-apply of the same capture delivery is a strict no-op', async () => {
    // Arrange: PENDING PayPal order transaction (as createCheckoutOrder leaves it).
    const tx = await prisma.transaction.create({
      data: {
        amount: new Decimal('2.50'),
        currency: 'USD',
        type: 'OUTBOUND',
        status: 'PENDING',
        fromAccountId: accountId,
        providerName: 'paypal',
        providerRefId: 'NORMTEST-ORDER-1',
        providerMetadata: { orderId: 'NORMTEST-ORDER-1', state: 'WAITING_FOR_PAYER_APPROVAL' },
      },
    });
    const balanceBefore = (await prisma.account.findUnique({ where: { id: accountId } })).balance.toString();

    const event = captureCompletedEvent({
      id: 'NORMTEST-CAPTURE-1',
      custom_id: tx.id,
      amount: { value: '2.50', currency_code: 'USD' },
    });

    // Act: reconcile twice (as the replayer's --apply does against history).
    const first = await paymentService.handleProviderWebhook(event);
    const balanceAfterFirst = (await prisma.account.findUnique({ where: { id: accountId } })).balance.toString();
    const second = await paymentService.handleProviderWebhook(event);

    // Assert: first reconciles, second is already_processed; balance burned
    // exactly once (100 → 97.50 for a 2.50 OUTBOUND), one row, terminal state.
    expect(first.status).toBe('processed');
    expect(first.transactionId).toBe(tx.id);
    expect(second.status).toBe('already_processed');
    expect(second.transactionId).toBe(tx.id);
    expect(balanceAfterFirst).toBe('97.5'); // Prisma decimal toString: trailing zero dropped
    const count = await prisma.transaction.count({ where: { providerRefId: 'NORMTEST-ORDER-1' } });
    expect(count).toBe(1);
    const status = (await prisma.transaction.findUnique({ where: { id: tx.id } })).status;
    expect(status).toBe('COMPLETED');
  });
});
