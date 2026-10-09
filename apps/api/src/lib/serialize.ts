/**
 * Shared JSON-Schema building blocks for Fastify response serialization.
 *
 * WHY THIS EXISTS (the invariant):
 *   Every credential-shaped field (Agent.apiKey, Owner password hash,
 *   Webhook.secret, VirtualCard CVV/cardNumber, external bank account
 *   numbers) must never reach a client. Fastify's serializer strips any
 *   response field that the route's response `schema` does not explicitly
 *   declare — that stripping is the structural guarantee, so routes attach
 *   `schema: { response: { ... } }` built from these helpers. A future
 *   Prisma `include` change therefore cannot leak a credential: the field
 *   simply is not in the declared shape.
 *
 *   NEVER use `additionalProperties: true` on credential-bearing response
 *   schemas — it turns the allowlist back into a passthrough (verified
 *   empirically against this Fastify install).
 */

/** ISO 8601 timestamp as produced by Date.prototype.toJSON / toISOString. */
export const DATE_TIME = { type: 'string', format: 'date-time' } as const;

/** A decimal amount rendered as a Decimal.toString() string. */
export const decStr = { type: 'string' } as const;

/** `T | null`, matching Prisma optional relations. */
export function nullable<T extends object>(schema: T) {
  return { anyOf: [schema, { type: 'null' }] } as const;
}

/** Plain string property. */
export const str = { type: 'string' } as const;

/**
 * The single error envelope used by every error branch in this app
 * ({ error: { code, message, timestamp, details? } }).
 *
 * While `code`/`message` shape is uniform, the `details` payload varies by
 * caller (zod `ZodIssue[]`, provider strings, app-specific) — it is
 * intentionally a passthrough so error text never gets mangled by
 * serialization-typing mistakes. It contains no credentials by inspection.
 */
export function errorResponse() {
  return {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: str,
          message: str,
          timestamp: DATE_TIME,
          details: {
            anyOf: [
              { type: 'array', items: {} as object },
              { type: 'object', additionalProperties: true },
              { type: 'null' },
            ],
          },
        },
        required: ['code', 'message', 'timestamp'],
      },
    },
    required: ['error'],
  };
}

/** Public Agent shape (see services/agent/agent-public.ts). */
export const publicAgent = {
  type: 'object',
  properties: {
    id: str,
    name: str,
    platform: str,
    createdAt: DATE_TIME,
  },
  required: ['id', 'name', 'platform', 'createdAt'],
} as const;

/**
 * Full Account row as Prisma transactions include it via
 * `include: { Account_Transaction_...: { include: { Agent: { select: AGENT_PUBLIC_SELECT } } } }`.
 * The nested agent is the PUBLIC agent only — the apiKey can't appear
 * because fast-json-stringify serializes only declared properties.
 */
export const accountRow = {
  type: 'object',
  properties: {
    id: str,
    type: str,
    balance: decStr,
    currency: str,
    status: str,
    accountNumber: nullable(str),
    agentId: nullable(str),
    createdAt: DATE_TIME,
    agent: nullable(publicAgent),
  },
  required: ['id', 'balance', 'currency', 'status', 'createdAt'],
} as const;

/**
 * SpendingRules JSON blob shape (`Account.spendingRules`). Values are
 * authoritative strings written via PATCH /accounts/:id/rules. Kept as
 * passthrough (no credentials can live here — it is user-set rule config,
 * asserted in the security suite).
 */
export const spendingRules = { type: 'object', additionalProperties: true } as const;
