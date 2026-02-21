import Decimal from 'decimal.js';
import crypto from 'crypto';
import {
  PaymentProvider,
  CardDetails,
  AuthorizationResponse,
  CaptureResponse,
  RefundResponse,
  WebhookEvent,
} from './payment-provider.interface';
import { WebhookEventType } from '@moltmoney/shared';

/**
 * Mock payment provider that simulates real card issuer functionality
 * for development and testing purposes
 */
export class MockPaymentProvider implements PaymentProvider {
  // In-memory storage for simulated transactions
  private authorizations = new Map<string, AuthorizationResponse>();
  private captures = new Map<string, CaptureResponse>();
  private refunds = new Map<string, RefundResponse>();

  /**
   * Generate a card number that passes the Luhn algorithm check
   * Format: 4111 XXXX XXXX XXXX (test Visa format)
   */
  private generateCardNumber(): string {
    // Start with test Visa prefix
    const prefix = '4111';
    
    // Generate 11 random digits
    const randomDigits = Array.from({ length: 11 }, () =>
      Math.floor(Math.random() * 10)
    ).join('');
    
    // Combine prefix and random digits (15 digits total)
    const partialCard = prefix + randomDigits;
    
    // Calculate Luhn check digit
    const checkDigit = this.calculateLuhnCheckDigit(partialCard);
    
    // Format as 4111 XXXX XXXX XXXX
    const fullCard = partialCard + checkDigit;
    return fullCard.replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  /**
   * Calculate Luhn algorithm check digit
   */
  private calculateLuhnCheckDigit(cardNumber: string): number {
    const digits = cardNumber.replace(/\s/g, '').split('').map(Number);
    let sum = 0;

    // Process from right to left, doubling every second digit
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = digits[i];
      
      // Double every second digit (from right, starting with the second-to-last)
      if ((digits.length - i) % 2 === 1) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
    }

    // Check digit makes the total a multiple of 10
    return (10 - (sum % 10)) % 10;
  }

  /**
   * Generate a random expiry date 2-5 years in the future
   */
  private generateExpiryDate(): { month: number; year: number } {
    const now = new Date();
    const yearsToAdd = 2 + Math.floor(Math.random() * 4); // 2-5 years
    const expiryYear = now.getFullYear() + yearsToAdd;
    const expiryMonth = 1 + Math.floor(Math.random() * 12); // 1-12

    return {
      month: expiryMonth,
      year: expiryYear,
    };
  }

  /**
   * Generate a random 3-digit CVV
   */
  private generateCVV(): string {
    return Math.floor(100 + Math.random() * 900).toString();
  }

  /**
   * Simulate processing delay (100ms)
   */
  private async simulateDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Issue a virtual card for an account
   */
  async issueVirtualCard(_accountId: string): Promise<CardDetails> {
    await this.simulateDelay();

    const cardNumber = this.generateCardNumber();
    const expiry = this.generateExpiryDate();
    const cvv = this.generateCVV();

    return {
      cardNumber,
      expiryMonth: expiry.month,
      expiryYear: expiry.year,
      cvv,
    };
  }

  /**
   * Authorize a payment
   * Simulates approval/decline based on provided context
   */
  async authorizePayment(
    _cardNumber: string,
    _amount: Decimal,
    merchantName: string,
    merchantCategory?: string
  ): Promise<AuthorizationResponse> {
    await this.simulateDelay();

    // Generate authorization ID
    const authorizationId = crypto.randomUUID();

    // For mock provider, we always approve
    // The actual balance and rule checking happens in the payment service
    // This mock just simulates the provider's response
    const response: AuthorizationResponse = {
      approved: true,
      authorizationId,
      merchantName,
      merchantCategory,
    };

    // Store authorization for later capture
    this.authorizations.set(authorizationId, response);

    return response;
  }

  /**
   * Simulate authorization decline
   * This is a helper method for testing different decline scenarios
   */
  async authorizePaymentWithDecline(
    _cardNumber: string,
    _amount: Decimal,
    merchantName: string,
    declineReason: 'insufficient_funds' | 'blocked_category' | 'spend_limit_exceeded',
    merchantCategory?: string
  ): Promise<AuthorizationResponse> {
    await this.simulateDelay();

    return {
      approved: false,
      declineReason,
      merchantName,
      merchantCategory,
    };
  }

  /**
   * Capture a previously authorized payment
   */
  async capturePayment(authorizationId: string): Promise<CaptureResponse> {
    await this.simulateDelay();

    // Verify authorization exists
    const authorization = this.authorizations.get(authorizationId);
    if (!authorization) {
      throw new Error('Authorization not found');
    }

    if (!authorization.approved) {
      throw new Error('Cannot capture declined authorization');
    }

    const transactionId = crypto.randomUUID();
    const response: CaptureResponse = {
      success: true,
      transactionId,
    };

    // Store capture
    this.captures.set(transactionId, response);

    return response;
  }

  /**
   * Refund a completed payment
   */
  async refundPayment(
    transactionId: string,
    _amount: Decimal
  ): Promise<RefundResponse> {
    await this.simulateDelay();

    // Verify transaction exists
    const capture = this.captures.get(transactionId);
    if (!capture) {
      throw new Error('Transaction not found');
    }

    const refundId = crypto.randomUUID();
    const response: RefundResponse = {
      success: true,
      refundId,
    };

    // Store refund
    this.refunds.set(refundId, response);

    return response;
  }

  /**
   * Parse and verify a webhook payload
   * For mock provider, we just parse the JSON without signature verification
   */
  async parseWebhook(payload: string, _signature: string): Promise<WebhookEvent> {
    try {
      const data = JSON.parse(payload);
      
      // Validate required fields
      if (!data.type || !data.data || !data.timestamp) {
        throw new Error('Invalid webhook payload format');
      }

      return {
        type: data.type as WebhookEventType,
        data: data.data,
        timestamp: new Date(data.timestamp),
      };
    } catch (error) {
      throw new Error('Failed to parse webhook payload');
    }
  }

  /**
   * Generate a webhook event (helper for testing)
   */
  generateWebhookEvent(
    type: WebhookEventType,
    data: any
  ): WebhookEvent {
    return {
      type,
      data,
      timestamp: new Date(),
    };
  }

  /**
   * Clear all stored data (helper for testing)
   */
  clearStorage(): void {
    this.authorizations.clear();
    this.captures.clear();
    this.refunds.clear();
  }
}
