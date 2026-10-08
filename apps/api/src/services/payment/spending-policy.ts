import { PrismaClient, TxStatus, TxType } from '@moltmoney/database';
import Decimal from 'decimal.js';
import type { SpendingRules } from './payment.service';

/**
 * Single source of truth for daily-spend aggregation ("spentToday").
 *
 * Used by BOTH PaymentService.evaluateSpendingRules and the
 * GET /accounts/:id/spending-policy endpoint so the daily-limit check and the
 * agent-facing policy view can never diverge. Semantics preserved verbatim
 * from the original evaluateSpendingRules aggregation:
 * - server-local day boundaries (00:00:00.000 – 23:59:59.999)
 * - COMPLETED transactions only (pending/non-completed never counted)
 * - OUTBOUND, INTERNAL and PAYOUT types only (INBOUND funding excluded)
 * - outflows from the given account (fromAccountId)
 */
export async function getSpentToday(
  prisma: PrismaClient,
  accountId: string,
  now: Date = new Date()
): Promise<Decimal> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const todayTransactions = await prisma.transaction.findMany({
    where: {
      fromAccountId: accountId,
      status: TxStatus.COMPLETED,
      type: {
        in: [TxType.OUTBOUND, TxType.INTERNAL, TxType.PAYOUT],
      },
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  return todayTransactions.reduce(
    (sum, tx) => sum.plus(new Decimal(tx.amount.toString())),
    new Decimal(0)
  );
}

/**
 * remainingToday derived from the authoritative dailyLimit and spentToday.
 * Null/empty/unset daily limit = unlimited (returns null). Never negative:
 * an over-limit day reports 0 remaining.
 */
export function getRemainingToday(
  dailyLimit: string | undefined | null,
  spentToday: Decimal
): Decimal | null {
  if (dailyLimit === undefined || dailyLimit === null || dailyLimit === '') {
    return null;
  }
  const remaining = new Decimal(dailyLimit).minus(spentToday);
  return remaining.lessThan(0) ? new Decimal(0) : remaining;
}

/**
 * Build the full GET /accounts/:id/spending-policy response from the
 * account's authoritative rules and the shared aggregation.
 */
export async function buildSpendingPolicyResponse(
  prisma: PrismaClient,
  account: { id: string; currency: string; spendingRules: unknown }
): Promise<{
  accountId: string;
  currency: string;
  rules: unknown;
  spentToday: string;
  remainingToday: string | null;
  serverTime: string;
}> {
  const spent = await getSpentToday(prisma, account.id);
  const rules = (account.spendingRules ?? null) as SpendingRules | null;
  const remaining = getRemainingToday(rules?.dailyLimit, spent);

  return {
    accountId: account.id,
    currency: account.currency,
    rules: account.spendingRules ?? null,
    spentToday: spent.toString(),
    remainingToday: remaining ? remaining.toString() : null,
    serverTime: new Date().toISOString(),
  };
}
