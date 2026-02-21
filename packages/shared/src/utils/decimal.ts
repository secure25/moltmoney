// Decimal.js wrapper utilities for money calculations
import Decimal from 'decimal.js';

// Configure Decimal.js for monetary calculations
Decimal.set({
  precision: 18,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

export const CURRENCY = 'USD';
export const DECIMAL_PRECISION = 18;
export const DECIMAL_SCALE = 2;

/**
 * Create a Decimal from a string, number, or Decimal
 */
export function toDecimal(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

/**
 * Convert a Decimal to a string with exactly 2 decimal places
 */
export function toMoneyString(value: Decimal): string {
  return value.toFixed(DECIMAL_SCALE);
}

/**
 * Parse a money string to Decimal
 */
export function parseMoneyString(value: string): Decimal {
  const decimal = new Decimal(value);
  if (decimal.decimalPlaces() > DECIMAL_SCALE) {
    throw new Error(`Amount has more than ${DECIMAL_SCALE} decimal places`);
  }
  return decimal;
}

/**
 * Check if a value is a valid positive amount
 */
export function isValidAmount(value: Decimal): boolean {
  return value.isPositive() && !value.isZero() && value.isFinite();
}

/**
 * Check if a value is zero
 */
export function isZero(value: Decimal): boolean {
  return value.isZero();
}

/**
 * Add two decimal values
 */
export function add(a: Decimal, b: Decimal): Decimal {
  return a.plus(b);
}

/**
 * Subtract two decimal values
 */
export function subtract(a: Decimal, b: Decimal): Decimal {
  return a.minus(b);
}

/**
 * Compare two decimal values
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compare(a: Decimal, b: Decimal): number {
  return a.comparedTo(b);
}

/**
 * Check if a >= b
 */
export function greaterThanOrEqual(a: Decimal, b: Decimal): boolean {
  return a.greaterThanOrEqualTo(b);
}

/**
 * Check if a > b
 */
export function greaterThan(a: Decimal, b: Decimal): boolean {
  return a.greaterThan(b);
}

/**
 * Check if a <= b
 */
export function lessThanOrEqual(a: Decimal, b: Decimal): boolean {
  return a.lessThanOrEqualTo(b);
}

/**
 * Check if a < b
 */
export function lessThan(a: Decimal, b: Decimal): boolean {
  return a.lessThan(b);
}

/**
 * Check if two amounts are equal
 */
export function equals(a: Decimal, b: Decimal): boolean {
  return a.equals(b);
}

/**
 * Get the minimum of two values
 */
export function min(a: Decimal, b: Decimal): Decimal {
  return Decimal.min(a, b);
}

/**
 * Get the maximum of two values
 */
export function max(a: Decimal, b: Decimal): Decimal {
  return Decimal.max(a, b);
}

/**
 * Sum an array of decimal values
 */
export function sum(values: Decimal[]): Decimal {
  return values.reduce((acc, val) => acc.plus(val), new Decimal(0));
}

/**
 * Create a zero amount
 */
export function zero(): Decimal {
  return new Decimal(0);
}
