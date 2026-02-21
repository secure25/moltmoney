import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { MockPaymentProvider } from './mock-payment-provider';
import { WebhookEventType } from '@moltmoney/shared';

describe('MockPaymentProvider', () => {
  let provider: MockPaymentProvider;

  beforeEach(() => {
    provider = new MockPaymentProvider();
  });

  describe('issueVirtualCard', () => {
    it('should generate a valid card with correct format', async () => {
      const card = await provider.issueVirtualCard('test-account-id');

      // Check card number format (4111 XXXX XXXX XXXX)
      expect(card.cardNumber).toMatch(/^4111 \d{4} \d{4} \d{4}$/);

      // Check expiry date is in the future (2-5 years)
      const now = new Date();
      const currentYear = now.getFullYear();
      expect(card.expiryYear).toBeGreaterThanOrEqual(currentYear + 2);
      expect(card.expiryYear).toBeLessThanOrEqual(currentYear + 5);
      expect(card.expiryMonth).toBeGreaterThanOrEqual(1);
      expect(card.expiryMonth).toBeLessThanOrEqual(12);

      // Check CVV is 3 digits
      expect(card.cvv).toMatch(/^\d{3}$/);
      expect(parseInt(card.cvv)).toBeGreaterThanOrEqual(100);
      expect(parseInt(card.cvv)).toBeLessThanOrEqual(999);
    });

    it('should generate unique card numbers', async () => {
      const card1 = await provider.issueVirtualCard('account-1');
      const card2 = await provider.issueVirtualCard('account-2');

      expect(card1.cardNumber).not.toBe(card2.cardNumber);
    });

    it('should pass Luhn algorithm check', async () => {
      const card = await provider.issueVirtualCard('test-account-id');
      const cardNumber = card.cardNumber.replace(/\s/g, '');

      // Verify Luhn algorithm
      const digits = cardNumber.split('').map(Number);
      let sum = 0;
      let isEven = false;

      for (let i = digits.length - 1; i >= 0; i--) {
        let digit = digits[i];

        if (isEven) {
          digit *= 2;
          if (digit > 9) {
            digit -= 9;
          }
        }

        sum += digit;
        isEven = !isEven;
      }

      expect(sum % 10).toBe(0);
    });
  });

  describe('authorizePayment', () => {
    it('should approve payment and return authorization ID', async () => {
      const response = await provider.authorizePayment(
        '4111 1111 1111 1111',
        new Decimal('100.00'),
        'Test Merchant',
        'retail'
      );

      expect(response.approved).toBe(true);
      expect(response.authorizationId).toBeDefined();
      expect(response.merchantName).toBe('Test Merchant');
      expect(response.merchantCategory).toBe('retail');
    });

    it('should simulate processing delay', async () => {
      const start = Date.now();
      await provider.authorizePayment(
        '4111 1111 1111 1111',
        new Decimal('50.00'),
        'Test Merchant'
      );
      const duration = Date.now() - start;

      // Should take at least 100ms
      expect(duration).toBeGreaterThanOrEqual(90); // Allow some margin
    });
  });

  describe('authorizePaymentWithDecline', () => {
    it('should decline payment with insufficient_funds reason', async () => {
      const response = await provider.authorizePaymentWithDecline(
        '4111 1111 1111 1111',
        new Decimal('1000.00'),
        'Test Merchant',
        'insufficient_funds'
      );

      expect(response.approved).toBe(false);
      expect(response.declineReason).toBe('insufficient_funds');
      expect(response.authorizationId).toBeUndefined();
    });

    it('should decline payment with blocked_category reason', async () => {
      const response = await provider.authorizePaymentWithDecline(
        '4111 1111 1111 1111',
        new Decimal('50.00'),
        'Casino',
        'blocked_category',
        'gambling'
      );

      expect(response.approved).toBe(false);
      expect(response.declineReason).toBe('blocked_category');
    });

    it('should decline payment with spend_limit_exceeded reason', async () => {
      const response = await provider.authorizePaymentWithDecline(
        '4111 1111 1111 1111',
        new Decimal('5000.00'),
        'Luxury Store',
        'spend_limit_exceeded'
      );

      expect(response.approved).toBe(false);
      expect(response.declineReason).toBe('spend_limit_exceeded');
    });
  });

  describe('capturePayment', () => {
    it('should capture an authorized payment', async () => {
      // First authorize
      const authResponse = await provider.authorizePayment(
        '4111 1111 1111 1111',
        new Decimal('100.00'),
        'Test Merchant'
      );

      // Then capture
      const captureResponse = await provider.capturePayment(
        authResponse.authorizationId!
      );

      expect(captureResponse.success).toBe(true);
      expect(captureResponse.transactionId).toBeDefined();
    });

    it('should throw error for non-existent authorization', async () => {
      await expect(
        provider.capturePayment('non-existent-auth-id')
      ).rejects.toThrow('Authorization not found');
    });
  });

  describe('refundPayment', () => {
    it('should refund a captured payment', async () => {
      // Authorize and capture first
      const authResponse = await provider.authorizePayment(
        '4111 1111 1111 1111',
        new Decimal('100.00'),
        'Test Merchant'
      );
      const captureResponse = await provider.capturePayment(
        authResponse.authorizationId!
      );

      // Then refund
      const refundResponse = await provider.refundPayment(
        captureResponse.transactionId,
        new Decimal('100.00')
      );

      expect(refundResponse.success).toBe(true);
      expect(refundResponse.refundId).toBeDefined();
    });

    it('should throw error for non-existent transaction', async () => {
      await expect(
        provider.refundPayment('non-existent-tx-id', new Decimal('50.00'))
      ).rejects.toThrow('Transaction not found');
    });
  });

  describe('parseWebhook', () => {
    it('should parse valid webhook payload', async () => {
      const payload = JSON.stringify({
        type: WebhookEventType.PAYMENT_COMPLETED,
        data: { transactionId: 'tx-123', amount: '100.00' },
        timestamp: new Date().toISOString(),
      });

      const event = await provider.parseWebhook(payload, 'fake-signature');

      expect(event.type).toBe(WebhookEventType.PAYMENT_COMPLETED);
      expect(event.data.transactionId).toBe('tx-123');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should throw error for invalid JSON', async () => {
      await expect(
        provider.parseWebhook('invalid json', 'signature')
      ).rejects.toThrow('Failed to parse webhook payload');
    });

    it('should throw error for missing required fields', async () => {
      const payload = JSON.stringify({
        type: WebhookEventType.PAYMENT_COMPLETED,
        // Missing data and timestamp
      });

      await expect(
        provider.parseWebhook(payload, 'signature')
      ).rejects.toThrow('Failed to parse webhook payload');
    });
  });

  describe('generateWebhookEvent', () => {
    it('should generate webhook event with correct structure', () => {
      const event = provider.generateWebhookEvent(
        WebhookEventType.PAYMENT_COMPLETED,
        { transactionId: 'tx-123' }
      );

      expect(event.type).toBe(WebhookEventType.PAYMENT_COMPLETED);
      expect(event.data.transactionId).toBe('tx-123');
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('clearStorage', () => {
    it('should clear all stored data', async () => {
      // Create some data
      const authResponse = await provider.authorizePayment(
        '4111 1111 1111 1111',
        new Decimal('100.00'),
        'Test Merchant'
      );
      await provider.capturePayment(authResponse.authorizationId!);

      // Clear storage
      provider.clearStorage();

      // Verify data is cleared
      await expect(
        provider.capturePayment(authResponse.authorizationId!)
      ).rejects.toThrow('Authorization not found');
    });
  });
});
