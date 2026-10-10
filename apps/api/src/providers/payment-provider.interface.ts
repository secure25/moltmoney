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
 * Parameters for creating a checkout order
 */
export interface CreateOrderParams {
  amount: Decimal;
  currency?: string;
  description?: string;
  merchantName?: string;
  referenceId: string;
  returnUrl?: string;
  cancelUrl?: string;
}

/**
 * Response from creating a checkout order
 */
export interface CreateOrderResponse {
  orderId: string;
  status: string;
  approvalUrl?: string;
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
  captureId?: string;
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
   * Create an order for buyer approval (Checkout / Agentic commerce flow)
   * @param params - Order parameters
   * @returns Order response with approval URL
   */
  createOrder?(params: CreateOrderParams): Promise<CreateOrderResponse>;

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
   * Capture a previously authorized payment or approved order
   * @param authorizationId - The authorization ID or order ID to capture
   * @returns Capture response with transaction ID
   */
  capturePayment(authorizationId: string): Promise<CaptureResponse>;

  /**
   * Refund a completed payment
   * @param transactionId - The transaction/capture ID to refund
   * @param amount - The refund amount; omit for a full refund
   * @returns Refund response with refund ID
   */
  refundPayment(transactionId: string, amount?: Decimal): Promise<RefundResponse>;

  /**
   * Parse and verify a webhook payload
   * @param payload - The webhook payload as a string
   * @param signature - The webhook signature or header context for verification
   * @returns Parsed webhook event
   */
  parseWebhook(payload: string, signature: string | Record<string, any>): Promise<WebhookEvent>;
}

/**
 * Card issuing provider interface
 * Extends PaymentProvider to add virtual card issuance capability
 */
export interface CardIssuingProvider extends PaymentProvider {
  /**
   * Issue a virtual card for an account
   * @param accountId - The account ID to issue the card for
   * @returns Card details including number, expiry, and CVV
   */
  issueVirtualCard(accountId: string): Promise<CardDetails>;
}

