import { PrismaClient } from '@moltmoney/database';

/**
 * AUDIT SERVICE — security-relevant event log.
 *
 * Design guarantees:
 *   - FAILS OPEN: every method swallows and logs its own errors. An audit
 *     write can NEVER break (or even slow meaningfully) a financial request —
 *     a database hiccup degrades the trail, not the transaction.
 *   - NEVER stores credentials: callers must not pass apiKey/password/
 *     secret/cvv values in metadata; writeMetadata defensively strips any
 *     field with a credential-shaped key so a careless caller cannot leak.
 *   - actorType is 'owner' | 'agent' | 'system' (AuditActorType).
 *
 * Recorded events (see ACTION constants): agent creation, spending-rule
 * changes, approval decisions, PayPal order create/capture, payments/send,
 * card issue/freeze/unfreeze/cancel.
 */

export type AuditActorType = 'owner' | 'agent' | 'system';

/**
 * Canonical action names. Keeping them as constants (instead of free-string)
 * makes the log queryable and the test suite exact.
 */
export const AUDIT_ACTION = {
  AGENT_CREATED: 'agent.created',
  SPENDING_RULES_UPDATED: 'spending_rules.updated',
  PAYMENT_APPROVED: 'payment.approved',
  PAYMENT_DECLINED: 'payment.declined',
  PAYMENT_SENT: 'payment.sent',
  ORDER_CREATED: 'paypal.order_created',
  ORDER_CAPTURED: 'paypal.order_captured',
  CARD_ISSUED: 'card.issued',
  CARD_FROZEN: 'card.frozen',
  CARD_UNFROZEN: 'card.unfrozen',
  CARD_CANCELLED: 'card.cancelled',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

/** Credential-shaped keys that must never reach the metadata blob. */
const FORBIDDEN_METADATA_KEYS = new Set([
  'apikey',
  'api_key',
  'password',
  'passwordhash',
  'secret',
  'cvv',
  'cardnumber',
  'authorization',
  'token',
]);

/**
 * Shallow strip of credential-shaped keys + deep redaction for nested
 * objects that carry them. Primitive values pass through untouched.
 */
function sanitizeMetadata(input: unknown): Record<string, unknown> | undefined {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeMetadata(value) ?? {};
      continue;
    }
    out[key] = value;
  }
  return out;
}

export interface AuditEntryInput {
  actorType: AuditActorType;
  /** Owner/agent id; null for 'system'. */
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  /** Arbitrary structured data — credential-shaped keys are redacted. */
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Record one audit event. Fails OPEN: on any error the problem is logged
   * and the caller continues untouched (the promise always resolves).
   */
  async record(entry: AuditEntryInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: entry.actorType,
          actorId: entry.actorId ?? undefined,
          action: entry.action,
          targetType: entry.targetType ?? undefined,
          targetId: entry.targetId ?? undefined,
          metadata: sanitizeMetadata(entry.metadata) as any,
          ip: entry.ip ?? undefined,
        },
      });
    } catch (error: any) {
      // Fail open: never break a financial request because auditing hiccuped.
      console.error('[audit] failed to record event:', {
        action: entry.action,
        actorType: entry.actorType,
        message: error?.message,
      });
    }
  }
}

/** Convenience: an actor extracted from a Fastify request (owner or agent). */
export function actorFromRequest(request: { owner?: { id: string }; agent?: { id: string } } & { ip?: string }): {
  actorType: AuditActorType;
  actorId: string | null;
  ip: string | null;
} {
  if ((request as any).owner) {
    return { actorType: 'owner', actorId: (request as any).owner.id, ip: request.ip ?? null };
  }
  if ((request as any).agent) {
    return { actorType: 'agent', actorId: (request as any).agent.id, ip: request.ip ?? null };
  }
  return { actorType: 'system', actorId: null, ip: request.ip ?? null };
}
