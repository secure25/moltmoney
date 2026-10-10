import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { PayPalPaymentProvider } from './paypal-payment-provider';
import { PayPalClient } from './paypal-client';
import { PayPalApiError } from './types';

/**
 * Unit tests for PayPalPaymentProvider (Phases 5, 6, 10 + webhook mapping).
 * HTTP is stubbed on the PayPalClient — no live PayPal credentials needed.
 */

function makeProvider(overrides?: {
  request?: ReturnType<typeof vi.fn>;
  verifyWebhookSignature?: ReturnType<typeof vi.fn>;
}): { provider: PayPalPaymentProvider; request: ReturnType<typeof vi.fn> } {
  const request = overrides?.request ?? vi.fn();
  const client = {
    request,
    verifyWebhookSignature: overrides?.verifyWebhookSignature ?? vi.fn(),
  } as unknown as PayPalClient;
  return { provider: new PayPalPaymentProvider(client), request };
}

const validOrder = {
  id: 'ORDER-123',
  status: 'CREATED',
  links: [{ href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123', rel: 'approve' }],
};

describe('PayPalPaymentProvider.createOrder (Phase 5)', () => {
  let request: ReturnType<typeof vi.fn>;
  let provider: PayPalPaymentProvider;

  beforeEach(() => {
    ({ provider, request } = makeProvider());
  });

  it('creates an order with intent CAPTURE and returns the approval URL', async () => {
    request.mockResolvedValueOnce(validOrder);

    const res = await provider.createOrder({
      amount: new Decimal('25.50'),
      description: 'API credits',
      referenceId: 'moltmoney-tx-1',
    });

    expect(res).toEqual({
      orderId: 'ORDER-123',
      status: 'CREATED',
      approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123',
    });

    const [method, path, opts] = request.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('/v2/checkout/orders');
    expect(opts.idempotencyKey).toBe('moltmoney-tx-1');
    const body = opts.body;
    expect(body.intent).toBe('CAPTURE');
    expect(body.purchase_units[0].amount).toEqual({ currency_code: 'USD', value: '25.50' });
    expect(body.purchase_units[0].custom_id).toBe('moltmoney-tx-1');
  });

  it('uses a STABLE idempotency key across retries of the same logical operation', async () => {
    request.mockResolvedValue(validOrder);
    const params = { amount: new Decimal('10.00'), referenceId: 'tx-stable-1' };

    await provider.createOrder(params);
    await provider.createOrder(params);
    await provider.createOrder(params);

    const keys = request.mock.calls.map((c) => c[2].idempotencyKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('tx-stable-1');
  });

  it('includes return_url and cancel_url when provided', async () => {
    request.mockResolvedValueOnce(validOrder);

    await provider.createOrder({
      amount: new Decimal('10'),
      referenceId: 'tx-2',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
    });

    const [method, path, opts] = request.mock.calls[0];
    expect(path).toBe('/v2/checkout/orders');
    const body = opts.body;
    expect(body.return_url).toBe('https://example.com/return');
    expect(body.cancel_url).toBe('https://example.com/cancel');
  });

  it('rejects invalid amounts before any HTTP call', async () => {
    await expect(
      provider.createOrder({ amount: new Decimal('0'), referenceId: 'tx-3' })
    ).rejects.toThrow(/positive/);
    await expect(
      provider.createOrder({ amount: new Decimal('1.999'), referenceId: 'tx-4' })
    ).rejects.toThrow(/2 decimal places/);
    await expect(
      provider.createOrder({ amount: new Decimal('5'), referenceId: '' })
    ).rejects.toThrow(/referenceId/);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects invalid currency codes', async () => {
    await expect(
      provider.createOrder({ amount: new Decimal('5'), currency: 'us$!', referenceId: 'tx-5' })
    ).rejects.toThrow(/currency/i);
  });

  it('throws when PayPal returns an order without an id', async () => {
    request.mockResolvedValueOnce({ status: 'CREATED' });
    await expect(
      provider.createOrder({ amount: new Decimal('5'), referenceId: 'tx-6' })
    ).rejects.toBeInstanceOf(PayPalApiError);
  });

  it('propagates PayPalApiError from the client on API failure', async () => {
    request.mockRejectedValueOnce(new PayPalApiError('PayPal API request to /v2/checkout/orders failed (HTTP 422): UNPROCESSABLE_ENTITY', 422));
    await expect(
      provider.createOrder({ amount: new Decimal('5'), referenceId: 'tx-7' })
    ).rejects.toMatchObject({ name: 'PayPalApiError', status: 422 });
  });
});

describe('PayPalPaymentProvider.capturePayment (Phase 6)', () => {
  let request: ReturnType<typeof vi.fn>;
  let provider: PayPalPaymentProvider;

  beforeEach(() => {
    ({ provider, request } = makeProvider());
  });

  it('extracts the capture id and reports success for COMPLETED captures', async () => {
    request.mockResolvedValueOnce({
      id: 'ORDER-123',
      status: 'COMPLETED',
      purchase_units: [
        { payments: { captures: [{ id: 'CAP-9', status: 'COMPLETED' }] } },
      ],
    });

    const res = await provider.capturePayment('ORDER-123');

    expect(res).toEqual({ success: true, transactionId: 'CAP-9', captureId: 'CAP-9' });
    const [method, path, opts] = request.mock.calls[0];
    expect(path).toBe('/v2/checkout/orders/ORDER-123/capture');
    expect(opts.idempotencyKey).toBe('capture-ORDER-123');
  });

  it('reports failure without inventing a capture id when PayPal returns no capture', async () => {
    request.mockResolvedValueOnce({ id: 'ORDER-123', status: 'DECLINED' });
    const res = await provider.capturePayment('ORDER-123');
    expect(res.success).toBe(false);
    expect(res.captureId).toBeUndefined();
  });

  it('rejects empty order ids', async () => {
    await expect(provider.capturePayment('')).rejects.toThrow(/order id is required/);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('PayPalPaymentProvider.refundPayment (Phase 10)', () => {
  let request: ReturnType<typeof vi.fn>;
  let provider: PayPalPaymentProvider;

  beforeEach(() => {
    ({ provider, request } = makeProvider());
  });

  it('refunds a CAPTURE id (full refund when amount omitted)', async () => {
    request.mockResolvedValueOnce({ id: 'REF-1', status: 'COMPLETED' });

    const res = await provider.refundPayment('CAP-9');

    expect(res).toEqual({ success: true, refundId: 'REF-1' });
    const [method, path, opts] = request.mock.calls[0];
    expect(path).toBe('/v2/payments/captures/CAP-9/refund');
    expect(opts.body).toEqual({});
    expect(opts.idempotencyKey).toBe('refund-CAP-9-full');
  });

  it('sends an amount body for partial refunds with a distinct stable idempotency key', async () => {
    request.mockResolvedValueOnce({ id: 'REF-2', status: 'COMPLETED' });

    await provider.refundPayment('CAP-9', new Decimal('5.00'));

    const [method, path, opts] = request.mock.calls[0];
    expect(path).toBe('/v2/payments/captures/CAP-9/refund');
    expect(opts.body.amount).toEqual({ currency_code: 'USD', value: '5.00' });
    expect(opts.idempotencyKey).toBe('refund-CAP-9-5.00');
  });

  it('rejects invalid refund amounts and missing capture ids', async () => {
    await expect(provider.refundPayment('')).rejects.toThrow(/capture id is required/);
    await expect(provider.refundPayment('CAP-9', new Decimal('0'))).rejects.toThrow(/positive/);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('PayPalPaymentProvider.authorizePayment', () => {
  it('explicitly refuses card-based authorization', async () => {
    const { provider } = makeProvider();
    await expect(
      provider.authorizePayment('4111', new Decimal('5'), 'OpenAI')
    ).rejects.toThrow(/does not support card-based authorization/);
  });
});

describe('PayPalPaymentProvider.parseWebhook (Phase 7)', () => {
  const headers = {
    'paypal-transmission-id': 'tx-1',
    'paypal-transmission-time': '2026-01-01T00:00:00Z',
    'paypal-cert-url': 'https://api.paypal.com/cert',
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-transmission-sig': 'sig',
  };
  const captureCompletedPayload = JSON.stringify({
    id: 'WH-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource_type: 'capture',
    resource: { id: 'CAP-9', status: 'COMPLETED', custom_id: 'tx-1' },
  });

  it('maps a verified PAYMENT.CAPTURE.COMPLETED event', async () => {
    const verify = vi.fn().mockResolvedValueOnce(true);
    const { provider } = makeProvider({ verifyWebhookSignature: verify });

    const event = await provider.parseWebhook(captureCompletedPayload, headers);

    expect(event.type).toBeDefined();
    expect(event.data.category).toBe('capture_completed');
    expect(event.data.resource.id).toBe('CAP-9');
    expect(verify).toHaveBeenCalledTimes(1);
    // Verification must receive the exact payload + transmission data
    const arg = verify.mock.calls[0][0];
    expect(arg.transmissionId).toBe('tx-1');
    expect(arg.webhookEvent.event_type).toBe('PAYMENT.CAPTURE.COMPLETED');
  });

  it('throws WebhookVerificationError when the signature check fails', async () => {
    const verify = vi.fn().mockResolvedValueOnce(false);
    const { provider } = makeProvider({ verifyWebhookSignature: verify });

    await expect(provider.parseWebhook(captureCompletedPayload, headers)).rejects.toThrow(
      /signature verification failed/i
    );
  });

  it('rejects payloads missing transmission headers without any verification call', async () => {
    const verify = vi.fn();
    const { provider } = makeProvider({ verifyWebhookSignature: verify });

    await expect(
      provider.parseWebhook(captureCompletedPayload, { 'paypal-transmission-id': 'tx-1' })
    ).rejects.toThrow(/missing transmission headers/i);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects payloads that are not valid JSON', async () => {
    const verify = vi.fn();
    const { provider } = makeProvider({ verifyWebhookSignature: verify });

    await expect(provider.parseWebhook('not-json{{', headers)).rejects.toThrow(/not valid JSON/i);
    expect(verify).not.toHaveBeenCalled();
  });

  it('throws UnknownWebhookEventError for verified but unrecognized event types', async () => {
    const verify = vi.fn().mockResolvedValueOnce(true);
    const { provider } = makeProvider({ verifyWebhookSignature: verify });

    await expect(
      provider.parseWebhook(
        JSON.stringify({ id: 'WH-2', event_type: 'CUSTOMER.DISPUTE.CREATED', resource: {} }),
        headers
      )
    ).rejects.toMatchObject({
      name: 'UnknownWebhookEventError',
      eventType: 'CUSTOMER.DISPUTE.CREATED',
    });
  });

  it('maps every supported PayPal event category', async () => {
    const cases: Array<[string, string]> = [
      ['CHECKOUT.ORDER.APPROVED', 'order_approved'],
      ['PAYMENT.CAPTURE.COMPLETED', 'capture_completed'],
      ['PAYMENT.CAPTURE.DENIED', 'capture_declined'],
      ['PAYMENT.CAPTURE.DECLINED', 'capture_declined'],
      ['PAYMENT.CAPTURE.REFUNDED', 'capture_refunded'],
      ['PAYMENT.CAPTURE.REVERSED', 'capture_refunded'],
    ];
    for (const [eventType, expected] of cases) {
      const verify = vi.fn().mockResolvedValueOnce(true);
      const { provider } = makeProvider({ verifyWebhookSignature: verify });
      const event = await provider.parseWebhook(
        JSON.stringify({ id: 'WH', event_type: eventType, resource: {} }),
        headers
      );
      expect(event.data.category).toBe(expected);
    }
  });
});
