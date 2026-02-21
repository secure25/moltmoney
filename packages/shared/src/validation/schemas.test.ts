import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  fundAccountSchema,
  sendPaymentSchema,
  updateSpendingRulesSchema,
} from './schemas';

describe('Validation schemas', () => {
  describe('registerSchema', () => {
    it('should validate valid registration data', () => {
      const data = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      };
      const result = registerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const data = {
        email: 'invalid-email',
        name: 'Test User',
        password: 'password123',
      };
      const result = registerSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const data = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'short',
      };
      const result = registerSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('fundAccountSchema', () => {
    it('should validate valid amount', () => {
      const result = fundAccountSchema.safeParse({ amount: '100.50' });
      expect(result.success).toBe(true);
    });

    it('should reject negative amount', () => {
      const result = fundAccountSchema.safeParse({ amount: '-10.00' });
      expect(result.success).toBe(false);
    });

    it('should reject zero amount', () => {
      const result = fundAccountSchema.safeParse({ amount: '0' });
      expect(result.success).toBe(false);
    });

    it('should reject more than 2 decimal places', () => {
      const result = fundAccountSchema.safeParse({ amount: '100.123' });
      expect(result.success).toBe(false);
    });
  });

  describe('sendPaymentSchema', () => {
    it('should validate valid payment', () => {
      const data = {
        fromAccountId: '123e4567-e89b-12d3-a456-426614174000',
        toAccountId: '123e4567-e89b-12d3-a456-426614174001',
        amount: '50.00',
        description: 'Test payment',
      };
      const result = sendPaymentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const data = {
        fromAccountId: 'invalid-uuid',
        amount: '50.00',
      };
      const result = sendPaymentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('updateSpendingRulesSchema', () => {
    it('should validate spending rules', () => {
      const data = {
        dailyLimit: '1000.00',
        perTransactionLimit: '500.00',
        blockedCategories: ['gambling', 'alcohol'],
      };
      const result = updateSpendingRulesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should allow empty rules', () => {
      const result = updateSpendingRulesSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
