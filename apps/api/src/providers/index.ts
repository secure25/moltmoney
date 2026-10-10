export * from './payment-provider.interface';
export * from './mock-payment-provider';
export * from './paypal';

import { CardIssuingProvider, PaymentProvider } from './payment-provider.interface';
import { MockPaymentProvider } from './mock-payment-provider';
import { PayPalClient, PayPalPaymentProvider } from './paypal';

/**
 * Provider factory (Phase 9).
 *
 * PAYMENT_PROVIDER=mock (default) -> MockPaymentProvider
 * PAYMENT_PROVIDER=paypal         -> PayPalPaymentProvider (direct REST)
 *
 * Card issuing is intentionally NOT driven by PAYMENT_PROVIDER: PayPal does
 * not issue MoltMoney virtual cards, so the card-issuing provider is always
 * the mock issuer regardless of the active payment provider. This keeps card
 * issuing working when PAYMENT_PROVIDER=paypal.
 */
export function createPaymentProvider(): PaymentProvider {
  const providerName = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase();

  switch (providerName) {
    case 'mock':
      return new MockPaymentProvider();
    case 'paypal':
      // Fails fast (with a safe message) if PayPal credentials are missing.
      return new PayPalPaymentProvider(new PayPalClient());
    default:
      throw new Error(
        `Unsupported PAYMENT_PROVIDER "${providerName}" (expected "mock" or "paypal")`
      );
  }
}

export function createCardIssuingProvider(): CardIssuingProvider {
  return new MockPaymentProvider();
}
