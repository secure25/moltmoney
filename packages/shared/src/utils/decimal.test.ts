import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  toDecimal,
  toMoneyString,
  parseMoneyString,
  isValidAmount,
  isZero,
  add,
  subtract,
  compare,
  greaterThan,
  equals,
  sum,
  zero,
} from './decimal';

describe('Decimal utilities', () => {
  describe('toDecimal', () => {
    it('should convert string to Decimal', () => {
      const result = toDecimal('100.50');
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('100.5');
    });

    it('should convert number to Decimal', () => {
      const result = toDecimal(100.5);
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('100.5');
    });
  });

  describe('toMoneyString', () => {
    it('should format with exactly 2 decimal places', () => {
      expect(toMoneyString(toDecimal('100'))).toBe('100.00');
      expect(toMoneyString(toDecimal('100.5'))).toBe('100.50');
      expect(toMoneyString(toDecimal('100.99'))).toBe('100.99');
    });
  });

  describe('parseMoneyString', () => {
    it('should parse valid money strings', () => {
      const result = parseMoneyString('100.50');
      expect(result.toString()).toBe('100.5');
    });

    it('should throw on more than 2 decimal places', () => {
      expect(() => parseMoneyString('100.123')).toThrow();
    });
  });

  describe('isValidAmount', () => {
    it('should return true for positive amounts', () => {
      expect(isValidAmount(toDecimal('100'))).toBe(true);
      expect(isValidAmount(toDecimal('0.01'))).toBe(true);
    });

    it('should return false for zero or negative', () => {
      expect(isValidAmount(toDecimal('0'))).toBe(false);
      expect(isValidAmount(toDecimal('-10'))).toBe(false);
    });
  });

  describe('arithmetic operations', () => {
    it('should add correctly', () => {
      const result = add(toDecimal('100.50'), toDecimal('50.25'));
      expect(result.toString()).toBe('150.75');
    });

    it('should subtract correctly', () => {
      const result = subtract(toDecimal('100.50'), toDecimal('50.25'));
      expect(result.toString()).toBe('50.25');
    });
  });

  describe('comparison operations', () => {
    it('should compare values', () => {
      expect(compare(toDecimal('100'), toDecimal('50'))).toBe(1);
      expect(compare(toDecimal('50'), toDecimal('100'))).toBe(-1);
      expect(compare(toDecimal('100'), toDecimal('100'))).toBe(0);
    });

    it('should check greater than', () => {
      expect(greaterThan(toDecimal('100'), toDecimal('50'))).toBe(true);
      expect(greaterThan(toDecimal('50'), toDecimal('100'))).toBe(false);
    });

    it('should check equality', () => {
      expect(equals(toDecimal('100.00'), toDecimal('100'))).toBe(true);
      expect(equals(toDecimal('100'), toDecimal('50'))).toBe(false);
    });
  });

  describe('sum', () => {
    it('should sum array of decimals', () => {
      const values = [toDecimal('10'), toDecimal('20'), toDecimal('30')];
      const result = sum(values);
      expect(result.toString()).toBe('60');
    });

    it('should return zero for empty array', () => {
      const result = sum([]);
      expect(result.toString()).toBe('0');
    });
  });

  describe('zero', () => {
    it('should create zero decimal', () => {
      const result = zero();
      expect(result.toString()).toBe('0');
      expect(isZero(result)).toBe(true);
    });
  });
});
