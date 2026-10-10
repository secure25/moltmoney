import Decimal from 'decimal.js';
import { WebhookEventType } from '@moltmoney/shared';
import {
  AuthorizationResponse,
  CaptureResponse,
  CreateOrderParams,
  CreateOrderResponse,
  PaymentProvider,
  RefundResponse,
  WebhookEvent,
} from '../payment-provider.interface';
import { PayPalClient } from './paypal-client';
import {
  PayPalApiError,
  PayPalCaptureResource,
  PayPalOrder,
  PayPalRefund,
  UnknownWebhookEventError,
  WebhookVerificationError,
} from './types';

/** Transmission headers PayPal sends with every webhook delivery. */
export const PAYPAL_TRANSMISSION_HEADERS = [
  'paypal-transmission-id',
  'paypal-transmission-time',
  'paypal-cert-url',
  'paypal-auth-algo',
  'paypal-transmission-sig',
] as const;

export type PayPalTransmissionHeaders = Partial<Record<(typeof PAYPAL_TRANSMISSION_HEADERS)[number], string>>;

/** Maps a webhook category onto the shared outbound webhook event type. */
function categoryToWebhookEventType(category: NonNullable<ReturnType<typeof mapPayPalEventCategory>>): WebhookEventType {
  switch (category) {
    case 'order_approved':
      return WebhookEventType.PAYMENT_APPROVED;
    case 'capture_completed':
      return WebhookEventType.PAYMENT_COMPLETED;
    case 'capture_declined':
      return WebhookEventType.PAYMENT_DECLINED;
    case 'capture_refunded':
      return WebhookEventType.PAYMENT_REFUNDED;
  }
}

function defaultCurrency(): string {
  return (process.env.PAYPAL_CURRENCY || 'USD').toUpperCase();
}

function resolveCallbackUrl(kind: 'return' | 'cancel', explicit?: string): string | undefined {
  if (explicit) return explicit;
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) return undefined;
  return `${baseUrl.replace(/\/+$/, '')}/payments/paypal/${kind}`;
}

/**
 * Maps a raw PayPal event type to a semantic bucket used by the webhook
 * reconciler. Returns null for event types this integration does not handle.
 */
export function mapPayPalEventCategory(eventType: string): 'order_approved' | 'capture_completed' | 'capture_declined' | 'capture_refunded' | null {
  switch (eventType) {
    case 'CHECKOUT.ORDER.APPROVED':
      return 'order_approved';
    case 'PAYMENT.CAPTURE.COMPLETED':
      return 'capture_completed';
    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED':
      return 'capture_declined';
    case 'PAYMENT.CAPTURE.REFUNDED':
    case 'PAYMENT.CAPTURE.REVERSED':
      return 'capture_refunded';
    default:
      return null;
  }
}

/**
 * Real PayPal payment provider (direct REST, sandbox by default).
 *
 * Implements the checkout / agentic-commerce flow:
 *   createOrder -> approval URL -> buyer approves on PayPal -> capture
 *   -> PayPal webhook reconciles final state.
 */
export class PayPalPaymentProvider implements PaymentProvider {
  constructor(private readonly client: PayPalClient) {}

  /**
   * Create a PayPal Checkout order (Phase 5).
   * The MoltMoney reference id doubles as the stable PayPal-Request-Id so
   * retries of the same logical operation are idempotent on PayPal's side.
   */
  async createOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
    if (!(params.amount instanceof Decimal) || !params.amount.isFinite() || params.amount.lessThanOrEqualTo(0)) {
      throw new Error('Order amount must be a positive, finite amount');
    }
    if (params.amount.decimalPlaces() > 2) {
      throw new Error('Order amount must have at most 2 decimal places');
    }
    const currency = (params.currency || defaultCurrency()).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`Invalid currency code: ${currency}`);
    }
    if (!params.referenceId) {
      throw new Error('A stable referenceId is required to create a PayPal order');
    }

    const purchaseUnit: Record<string, unknown> = {
      reference_id: params.referenceId,
      custom_id: params.referenceId,
      amount: {
        currency_code: currency,
        value: params.amount.toFixed(2),
      },
    };
    if (params.description) {
      purchaseUnit.description = params.description.slice(0, 127);
    }

    const body: Record<string, unknown> = {
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
    };

    const returnUrl = resolveCallbackUrl('return', params.returnUrl);
    const cancelUrl = resolveCallbackUrl('cancel', params.cancelUrl);
    if (returnUrl && cancelUrl) {
      body.return_url = returnUrl;
      body.cancel_url = cancelUrl;
    }

    const order = await this.client.request<PayPalOrder>('POST', '/v2/checkout/orders', {
      body,
      idempotencyKey: params.referenceId,
    });

    if (!order || typeof order.id !== 'string' || !order.id) {
      throw new PayPalApiError('PayPal order creation returned an invalid response', 502);
    }

    const approvalUrl = order.links?.find((link) => link.rel === 'approve')?.href;

    return {
      orderId: order.id,
      status: typeof order.status === 'string' ? order.status : 'CREATED',
      approvalUrl,
    };
  }

  /**
   * Capture an approved PayPal order (Phase 6).
   * Idempotency key is derived from the order id, so re-capturing the same
   * order after a retry does not double-charge.
   */
  async capturePayment(orderId: string): Promise<CaptureResponse> {
    if (!orderId || typeof orderId !== 'string') {
      throw new Error('A PayPal order id is required to capture a payment');
    }

    const order = await this.client.request<PayPalOrder>(
      'POST',
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      { idempotencyKey: `capture-${orderId}` }
    );

    if (!order || typeof order.id !== 'string') {
      throw new PayPalApiError('PayPal capture returned an invalid response', 502);
    }

    const capture: PayPalCaptureResource | undefined =
      order.purchase_units?.[0]?.payments?.captures?.[0];

    if (!capture || typeof capture.id !== 'string') {
      // Capture rejected or in an unexpected shape; never invent a capture id.
      return { success: false, transactionId: order.id };
    }

    return {
      success: capture.status === 'COMPLETED',
      transactionId: capture.id,
      captureId: capture.id,
    };
  }

  /**
   * Refund a capture via the PayPal Payments API (Phase 10).
   * `captureId` MUST be the actual PayPal Capture ID (never an order or
   * authorization id). Omitting the amount performs a full refund; passing an
   * amount performs a partial refund. The RefundResponse contract is shared
   * with the mock provider.
   */
  async refundPayment(captureId: string, amount?: Decimal): Promise<RefundResponse> {
    if (!captureId || typeof captureId !== 'string') {
      throw new Error('A PayPal capture id is required to refund a payment');
    }

    let body: Record<string, unknown> = {};
    if (amount !== undefined) {
      if (!(amount instanceof Decimal) || !amount.isFinite() || amount.lessThanOrEqualTo(0)) {
        throw new Error('Refund amount must be a positive, finite amount');
      }
      if (amount.decimalPlaces() > 2) {
        throw new Error('Refund amount must have at most 2 decimal places');
      }
      body = { amount: { currency_code: defaultCurrency(), value: amount.toFixed(2) } };
    }

    const refund = await this.client.request<PayPalRefund>(
      'POST',
      `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
      {
        body,
        idempotencyKey: `refund-${captureId}-${amount ? amount.toFixed(2) : 'full'}`,
      }
    );

    if (!refund || typeof refund.id !== 'string' || !refund.id) {
      throw new PayPalApiError('PayPal refund returned an invalid response', 502);
    }

    return { success: true, refundId: refund.id };
  }

  /**
   * Card-based authorization is not supported by PayPal: card issuing and
   * card payments remain the responsibility of the CardIssuingProvider
   * (mock issuer). Use the checkout order flow instead.
   */
  async authorizePayment(
    _cardNumber: string,
    _amount: Decimal,
    _merchantName: string,
    _merchantCategory?: string
  ): Promise<AuthorizationResponse> {
    throw new Error(
      'PayPalPaymentProvider does not support card-based authorization; use the checkout order flow (createOrder) instead'
    );
  }

  /**
   * Verify and parse an inbound PayPal webhook (Phase 7).
   * The payload is only ever processed after PayPal confirms the
   * transmission signature. Unrecognized (but validly signed) event types
   * throw UnknownWebhookEventError so the route can record and acknowledge
   * them without processing.
   */
  async parseWebhook(
    payload: string,
    signature: string | Record<string, any>
  ): Promise<WebhookEvent> {
    let event: any;
    try {
      event = JSON.parse(payload);
    } catch {
      throw new WebhookVerificationError('Invalid webhook payload: not valid JSON');
    }

    if (
      !event ||
      typeof event !== 'object' ||
      typeof event.event_type !== 'string' ||
      !event.event_type
    ) {
      throw new WebhookVerificationError('Invalid webhook payload: missing event_type');
    }

    const headers: Record<string, string> =
      typeof signature === 'string' ? {} : signature ?? {};
    const transmissionId = headers['paypal-transmission-id'];
    const transmissionTime = headers['paypal-transmission-time'];
    const certUrl = headers['paypal-cert-url'];
    const authAlgo = headers['paypal-auth-algo'];
    const transmissionSig = headers['paypal-transmission-sig'];

    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
      throw new WebhookVerificationError(
        'PayPal webhook signature verification failed: missing transmission headers'
      );
    }

    const verified = await this.client.verifyWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookEvent: event,
    });

    if (!verified) {
      throw new WebhookVerificationError('PayPal webhook signature verification failed');
    }

    const category = mapPayPalEventCategory(event.event_type);
    if (!category) {
      throw new UnknownWebhookEventError(event.event_type);
    }

    return {
      type: categoryToWebhookEventType(category),
      data: {
        category,
        eventType: event.event_type,
        eventId: typeof event.id === 'string' ? event.id : null,
        resourceType: typeof event.resource_type === 'string' ? event.resource_type : null,
        resource: event.resource ?? {},
      },
      timestamp: event.create_time ? new Date(event.create_time) : new Date(),
    };
  }
}
