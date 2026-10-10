import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createPaymentProvider,
  createCardIssuingProvider,
} from './index';
import { MockPaymentProvider } from './mock-payment-provider';
import { PayPalPaymentProvider } from './paypal';

describe('Provider factory (Phase 9)', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.restoreAllMocks();
  });

  it('builds MockPaymentProvider for PAYMENT_PROVIDER=mock', () => {
    process.env.PAYMENT_PROVIDER = 'mock';
    expect(createPaymentProvider()).toBeInstanceOf(MockPaymentProvider);
  });

  it('defaults to MockPaymentProvider when PAYMENT_PROVIDER is unset', () => {
    delete process.env.PAYMENT_PROVIDER;
    expect(createPaymentProvider()).toBeInstanceOf(MockPaymentProvider);
  });

  it('builds PayPalPaymentProvider for PAYMENT_PROVIDER=paypal with credentials present', () => {
    process.env.PAYMENT_PROVIDER = 'paypal';
    process.env.PAYPAL_CLIENT_ID = 'cid';
    process.env.PAYPAL_CLIENT_SECRET = 'csecret';
    process.env.PAYPAL_API_BASE_URL = 'https://api-m.sandbox.paypal.com';
    process.env.PAYPAL_WEBHOOK_ID = 'whid';

    const provider = createPaymentProvider();
    expect(provider).toBeInstanceOf(PayPalPaymentProvider);
  });

  it('fails fast with a safe message when PayPal credentials are missing', () => {
    process.env.PAYMENT_PROVIDER = 'paypal';
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;

    expect(() => createPaymentProvider()).toThrow(/PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET/);
    expect(() => createPaymentProvider()).not.toThrow(/csecret/);
  });

  it('rejects unknown provider names', () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    expect(() => createPaymentProvider()).toThrow(/Unsupported PAYMENT_PROVIDER/);
  });

  it('always returns the mock issuer for card issuing, even under paypal', () => {
    process.env.PAYMENT_PROVIDER = 'paypal';
    process.env.PAYPAL_CLIENT_ID = 'cid';
    process.env.PAYPAL_CLIENT_SECRET = 'csecret';

    const cardProvider = createCardIssuingProvider();
    expect(cardProvider).toBeInstanceOf(MockPaymentProvider);
    expect(typeof cardProvider.issueVirtualCard).toBe('function');
  });
});
