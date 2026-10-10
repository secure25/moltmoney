/**
 * PayPal provider types.
 *
 * Security note: error messages built from PayPal responses must never
 * include client credentials, OAuth tokens, or Authorization headers.
 * Only PayPal's own error `name` / `message` fields are surfaced.
 */

export interface PayPalClientConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webhookId: string | null;
}

export interface PayPalTokenResponse {
  scope?: string;
  access_token: string;
  token_type: string;
  app_id?: string;
  expires_in: number;
  nonce?: string;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface PayPalAmount {
  currency_code: string;
  value: string;
}

export interface PayPalCaptureResource {
  id: string;
  status: string;
  amount?: PayPalAmount;
  custom_id?: string;
  final_capture?: boolean;
  seller_receivable_breakdown?: Record<string, unknown>;
  supplementary_data?: {
    related_ids?: {
      order_id?: string;
      authorization_id?: string;
      capture_id?: string;
      refund_id?: string;
    };
  };
  create_time?: string;
  update_time?: string;
  links?: PayPalLink[];
}

export interface PayPalPurchaseUnit {
  reference_id?: string;
  amount?: PayPalAmount;
  description?: string;
  custom_id?: string;
  payments?: {
    captures?: PayPalCaptureResource[];
    authorizations?: Array<{ id: string; status: string }>;
    refunds?: Array<{ id: string; status: string }>;
  };
}

export interface PayPalOrder {
  id: string;
  status: string;
  intent?: string;
  purchase_units?: PayPalPurchaseUnit[];
  payer?: Record<string, unknown>;
  create_time?: string;
  links?: PayPalLink[];
}

export interface PayPalRefund {
  id: string;
  status: string;
  amount?: PayPalAmount;
  custom_id?: string;
  create_time?: string;
  links?: PayPalLink[];
}

export interface PayPalWebhookVerificationResponse {
  verification_status: 'SUCCESS' | 'FAILURE';
}

export interface PayPalWebhookVerificationInput {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookEvent: unknown;
}

/**
 * Error thrown for PayPal API failures.
 * The message only ever contains the HTTP status, PayPal's error name and
 * PayPal's own error message — never credentials or access tokens.
 */
export class PayPalApiError extends Error {
  readonly status: number;
  readonly paypalErrorName?: string;

  constructor(message: string, status: number, paypalErrorName?: string) {
    super(message);
    this.name = 'PayPalApiError';
    this.status = status;
    this.paypalErrorName = paypalErrorName;
  }
}

/** Thrown when a webhook payload fails PayPal signature verification. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * Thrown AFTER successful signature verification when the PayPal event type
 * is not recognized by this integration. The webhook route records the event
 * and acknowledges it without processing.
 */
export class UnknownWebhookEventError extends Error {
  readonly eventType: string;

  constructor(eventType: string) {
    super(`Unrecognized PayPal webhook event type: ${eventType}`);
    this.name = 'UnknownWebhookEventError';
    this.eventType = eventType;
  }
}
