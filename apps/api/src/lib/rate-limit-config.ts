/**
 * Rate-limit configuration (@fastify/rate-limit).
 *
 * Tiers (all env-configurable, sane defaults):
 *   - global  RATE_LIMIT_GLOBAL_MAX / RATE_LIMIT_GLOBAL_WINDOW_*   (loose)
 *   - auth    RATE_LIMIT_AUTH_MAX / RATE_LIMIT_AUTH_WINDOW_*      (strict:
 *             /auth/register, /auth/login, /auth/agents/keys — endpoints
 *             where credentials/API keys are minted)
 *   - money   RATE_LIMIT_MONEY_MAX / RATE_LIMIT_MONEY_WINDOW_*    (strict:
 *             API-key-authenticated money movement — payments/send,
 *             paypal order create/capture, card routes)
 *
 * Every 429 ships standard headers including Retry-After (plugin default).
 *
 * TEST ENVIRONMENT: when NODE_ENV=test the limits are raised to the widest
 * sane values so the ~400-test vitest suite (which fires many requests
 * through the same in-memory window) never trips a limiter unless a test is
 * explicitly exercising rate-limit behavior (those tests set their own
 * per-route overrides or the env vars directly).
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const isTest = process.env.NODE_ENV === 'test';

export const GLOBAL_RATE_LIMIT = isTest
  ? 1_000_000
  : intFromEnv('RATE_LIMIT_GLOBAL_MAX', 300);

export const AUTH_RATE_LIMIT = isTest ? 1_000_000 : intFromEnv('RATE_LIMIT_AUTH_MAX', 10);
export const MONEY_RATE_LIMIT = isTest ? 1_000_000 : intFromEnv('RATE_LIMIT_MONEY_MAX', 30);

const globalWindowMs = isTest
  ? 60_000
  : intFromEnv('RATE_LIMIT_GLOBAL_WINDOW_SECONDS', 60) * 1000;
const authWindowMs = isTest ? 60_000 : intFromEnv('RATE_LIMIT_AUTH_WINDOW_SECONDS', 60) * 1000;
const moneyWindowMs = isTest ? 60_000 : intFromEnv('RATE_LIMIT_MONEY_WINDOW_SECONDS', 60) * 1000;

/** Plugin-level (global) options, registered once in server.ts. */
export const RATE_LIMIT_OPTIONS = {
  global: true,
  max: GLOBAL_RATE_LIMIT,
  timeWindow: globalWindowMs,
  errorResponseBuilder: (_request: any, context: any) => {
    const error: any = new Error('Too many requests — slow down.');
    error.statusCode = 429;
    if (context && typeof context.after === 'number') {
      error.headers = { 'retry-after': context.after };
    }
    return error;
  },
};

/**
 * Per-route rate-limit config for strict tiers — spread into a route's
 * `config` option: `{ config: { rateLimit: AUTH_RATE_LIMIT_CONFIG } }`.
 */
export const AUTH_RATE_LIMIT_CONFIG = {
  max: AUTH_RATE_LIMIT,
  timeWindow: authWindowMs,
} as const;

export const MONEY_RATE_LIMIT_CONFIG = {
  max: MONEY_RATE_LIMIT,
  timeWindow: moneyWindowMs,
} as const;
