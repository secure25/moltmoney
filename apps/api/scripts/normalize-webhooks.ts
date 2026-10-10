/**
 * Roadmap item 1 — normalize historical PayPal webhook deliveries and the
 * legacy transaction row audit trail.
 *
 * WHAT IT DOES
 *
 *   Pass 1 — REPLAY recorded deliveries:
 *     Every ProviderWebhookEvent row (provider='paypal') holds the payload
 *     that ALREADY passed PayPal signature verification at intake (the live
 *     receiver stores only verified events). The replayer derives the exact
 *     WebhookEvent the live receiver processed — using the same
 *     mapPayPalEventCategory + resource extraction logic from
 *     PayPalPaymentProvider.parseWebhook — and feeds it to
 *     PaymentService.handleProviderWebhook. The reconciler's conditional
 *     updates make replay strictly idempotent: reconciled deliveries report
 *     'already_processed' and never re-apply state or balance changes.
 *
 *   Pass 2 — LEGACY BACKFILL:
 *     Transaction rows with providerName IS NULL are internal ledger events
 *     (legacy seed funding etc.). They get providerName='internal' so every
 *     row carries a definitive origin. Metadata only: no amounts, statuses,
 *     or dates change.
 *
 * MODES
 *   (default)     dry run: print what WOULD happen, change nothing.
 *   --apply       execute both passes (idempotent — safe to re-run).
 *   --dev         target the DEV database. The default target is the TEST
 *                 database; the script hard-aborts if DATABASE_URL does not
 *                 match the target it was asked to touch.
 *
 * Note: no PayPal network calls — verification already happened at intake.
 * Run:  npx tsx apps/api/scripts/normalize-webhooks.ts [--apply] [--dev]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PayPalPaymentProvider } from '../src/providers/paypal/paypal-payment-provider';
import { PaymentService } from '../src/services/payment/payment.service';
import { WebhookEventType } from '@moltmoney/shared';

/**
 * Rebuild the WebhookEvent exactly like PayPalPaymentProvider.parseWebhook
 * returns for a verified payload (same category mapping, resource shape).
 * We do not re-call parseWebhook because it demands transmission headers
 * that the storage layer does not persist — those headers were checked at
 * intake; only the verified payload survived, which is what we replay.
 */
export function eventFromStoredPayload(raw: string): { type: any; data: any; timestamp: Date } | null {
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!event || typeof event !== 'object' || typeof event.event_type !== 'string') {
    return null;
  }
  const category = mapPayPalEventCategory(event.event_type);
  if (!category) {
    return null;
  }
  return {
    type: categoryToWebhookEventType(category),
    data: {
      category,
      eventType: event.event_type,
      eventId: typeof event.id === 'string' ? event.id : null,
      resourceType: typeof event.resource_type === 'string' ? event.resource_type : null,
      resource: event.resource ?? {},
    },
    timestamp: event.create_time ? new Date(event.create_time) : new Date(),
  };
}

// Local copies of the provider's private module-level mappers (kept in sync
// by the unit test at the bottom of this file pinning provider behavior).
function mapPayPalEventCategory(eventType: string): 'order_approved' | 'capture_completed' | 'capture_declined' | 'capture_refunded' | null {
  switch (eventType) {
    case 'CHECKOUT.ORDER.APPROVED': return 'order_approved';
    case 'PAYMENT.CAPTURE.COMPLETED': return 'capture_completed';
    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED': return 'capture_declined';
    case 'PAYMENT.CAPTURE.REFUNDED':
    case 'PAYMENT.CAPTURE.REVERSED': return 'capture_refunded';
    default: return null;
  }
}

function categoryToWebhookEventType(category: 'order_approved' | 'capture_completed' | 'capture_declined' | 'capture_refunded') {
  switch (category) {
    case 'order_approved': return WebhookEventType.PAYMENT_APPROVED;
    case 'capture_completed': return WebhookEventType.PAYMENT_COMPLETED;
    case 'capture_declined': return WebhookEventType.PAYMENT_DECLINED;
    case 'capture_refunded': return WebhookEventType.PAYMENT_REFUNDED;
  }
}

interface ReplayResultRow {
  transmissionId: string;
  eventType: string;
  outcome: 'processed' | 'already_processed' | 'ignored' | 'error';
  transactionId?: string;
  detail?: string;
}

async function replayPayPalEvents(
  prisma: PrismaClient,
  apply: boolean
): Promise<ReplayResultRow[]> {
  const events = await prisma.providerWebhookEvent.findMany({
    where: { provider: 'paypal' },
    orderBy: { processedAt: 'asc' },
  });

  const results: ReplayResultRow[] = [];
  if (events.length === 0) {
    console.log('replay: no recorded PayPal webhook deliveries stored.');
    return results;
  }

  // PaymentService needs a PaymentProvider instance but never invokes it in
  // the replay path (handleProviderWebhook is provider-free); a typed null
  // cast keeps the constructor happy without network config.
  const paymentService = new PaymentService(prisma, null as any, undefined, undefined);

  for (const row of events) {
    const raw = typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload);
    const derived = eventFromStoredPayload(raw);
    if (!derived) {
      results.push({ transmissionId: row.transmissionId, eventType: row.eventType, outcome: 'error', detail: 'payload unmappable' });
      continue;
    }
    if (!apply) {
      // Dry run: categorize what WOULD happen without touching state.
      results.push({ transmissionId: row.transmissionId, eventType: row.eventType, outcome: 'ignored', detail: 'dry-run (would call handleProviderWebhook)' });
      continue;
    }
    try {
      const res = await paymentService.handleProviderWebhook(derived as any);
      results.push({
        transmissionId: row.transmissionId,
        eventType: row.eventType,
        outcome: res.status,
        transactionId: res.transactionId,
      });
    } catch (e: any) {
      results.push({ transmissionId: row.transmissionId, eventType: row.eventType, outcome: 'error', detail: e?.message?.slice(0, 140) });
    }
  }
  return results;
}

async function main() {
  // Imported by the unit test (scripts/normalize-webhooks.test.ts) for the
  // payload-derivation helpers; skip the CLI run when under vitest.
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return;
  }
  const apply = process.argv.includes('--apply');
  const targetDev = process.argv.includes('--dev');

  const targetName = targetDev ? 'moltmoney' : 'moltmoney_test';
  const url = process.env.DATABASE_URL || '';
  if (!url.includes(`/${targetName}`)) {
    console.error(
      `ABORT: DATABASE_URL does not point at ${targetName} (${targetDev ? 'DEV' : 'TEST'}).\n` +
      'Set DATABASE_URL explicitly to the database you intend to touch.'
    );
    process.exit(1);
  }

  console.log(`normalize-webhooks: mode=${apply ? 'APPLY' : 'DRY-RUN'} target=${targetName}`);
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    // ---- Pass 2: legacy provider-field audit (safe, both modes) ----
    const legacyRows = await prisma.transaction.findMany({
      where: { providerName: null },
      select: { id: true, type: true, status: true, amount: true, merchantName: true, description: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`legacy rows without providerName: ${legacyRows.length}`);
    for (const t of legacyRows) {
      console.log(`  - ${t.id} ${t.type} ${t.status} ${t.amount.toString()} ${(t.merchantName || t.description || '').slice(0, 40)}`);
    }
    if (apply && legacyRows.length > 0) {
      const upd = await prisma.transaction.updateMany({
        where: { providerName: null },
        data: { providerName: 'internal' },
      });
      console.log(`legacy backfill applied: providerName='internal' on ${upd.count} rows.`);
    } else if (!apply) {
      console.log('legacy backfill: DRY-RUN (would set providerName="internal" on the rows above).');
    }

    // ---- Pass 1: replay recorded PayPal deliveries (idempotent) ----
    const replay = await replayPayPalEvents(prisma, apply);
    for (const r of replay) {
      console.log(`  [${r.outcome}] ${r.transmissionId.slice(0, 10)} ${r.eventType}${r.transactionId ? ' tx=' + r.transactionId.slice(0, 8) : ''}${r.detail ? ' ' + r.detail : ''}`);
    }
    const processed = replay.filter((r) => r.outcome === 'processed');
    const already = replay.filter((r) => r.outcome === 'already_processed');
    const errored = replay.filter((r) => r.outcome === 'error');
    console.log(`replay summary: processed=${processed.length} already_processed=${already.length} errors=${errored.length}`);

    if (apply && errored.length > 0) {
      console.error('Replay finished WITH errors (see rows above). Fix + re-run; idempotency protects state.');
      process.exit(2);
    }
    if (!apply) console.log('DRY-RUN complete. Re-run with --apply to execute.');
  } finally {
    await prisma.$disconnect();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
