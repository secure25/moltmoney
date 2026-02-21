import Decimal from 'decimal.js';
import { WebhookEventType } from '@moltmoney/shared';

/**
 * Card details returned when issuing a virtual card
 */
export interface CardDetails {
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
}

/**
 * Response from payment authorization
 */
export interface AuthorizationResponse {
  approved: boolean;
  authorizationId?: string;
  declineReason?: string;
  merchantName: string;
  merchantCategory?: string;
}

/**
 * Response from payment capture
 */
export interface CaptureResponse {
  success: boolean;
  transactionId: string;
}

/**
 * Response from payment refund
 */
export interface RefundResponse {
  success: boolean;
  refundId: string;
}

/**
 * Webhook event data
 */
export interface WebhookEvent {
  type: WebhookEventType;
  data: any;
  timestamp: Date;
}

/**
 * Payment provider interface
 * Defines the contract for payment providers, enabling swappable implementations
 */
export interface PaymentProvider {
  /**
   * Issue a virtual card for an account
   * @param accountId - The account ID to issue the card for
   * @returns Card details including number, expiry, and CVV
   */
  issueVirtualCard(accountId: string): Promise<CardDetails>;

  /**
   * Authorize a payment
   * @param cardNumber - The card number to charge
   * @param amount - The payment amount
   * @param merchantName - The merchant name
   * @param merchantCategory - Optional merchant category code
   * @returns Authorization response with approval status
   */
  authorizePayment(
    cardNumber: string,
    amount: Decimal,
    merchantName: string,
    merchantCategory?: string
  ): Promise<AuthorizationResponse>;

  /**
   * Capture a previously authorized payment
   * @param authorizationId - The authorization ID to capture
   * @returns Capture response with transaction ID
   */
  capturePayment(authorizationId: string): Promise<CaptureResponse>;

  /**
   * Refund a completed payment
   * @param transactionId - The transaction ID to refund
   * @param amount - The refund amount
   * @returns Refund response with refund ID
   */
  refundPayment(transactionId: string, amount: Decimal): Promise<RefundResponse>;

  /**
   * Parse and verify a webhook payload
   * @param payload - The webhook payload as a string
   * @param signature - The webhook signature for verification
   * @returns Parsed webhook event
   */
  parseWebhook(payload: string, signature: string): Promise<WebhookEvent>;
}
