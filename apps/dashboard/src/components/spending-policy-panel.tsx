'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * Spending-policy panel — the authoritative SERVER view of an account's
 * rules and today's usage (GET /accounts/:id/spending-policy):
 *
 *   { accountId, currency, rules: { perTransactionLimit, dailyLimit,
 *     requireApprovalAbove, blockedCategories[] }, spentToday,
 *     remainingToday, serverTime }
 *
 * remainingToday is null when dailyLimit is unset and clamped to 0 when
 * over (server contract); the progress bar mirrors that.
 *
 * refreshSignal increments whenever the rules editor saves, and
 * liveBlockedCategories overrides the blocked list the instant the user
 * edits it in the editor (before the next server refresh lands).
 */

interface SpendingPolicy {
  accountId: string
  currency: string
  rules: {
    perTransactionLimit?: string
    dailyLimit?: string
    requireApprovalAbove?: string
    blockedCategories?: string[]
  } | null
  spentToday: string
  remainingToday: string | null
  serverTime: string
}

interface SpendingPolicyPanelProps {
  accountId: string
  /** Increment (or change) to re-fetch the policy from the server. */
  refreshSignal?: number | string | null
  /** Live blockedCategories being typed in the rules editor (optional). */
  liveBlockedCategories?: string[] | null
}

export function SpendingPolicyPanel({
  accountId,
  refreshSignal,
  liveBlockedCategories,
}: SpendingPolicyPanelProps) {
  const [policy, setPolicy] = useState<SpendingPolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchPolicy = useCallback(async () => {
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/accounts/${accountId}/spending-policy`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }
      )
      if (!response.ok) {
        setError(true)
        return
      }
      setPolicy(await response.json())
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    void fetchPolicy()
  }, [fetchPolicy, refreshSignal])

  const rules = policy?.rules ?? null
  // Prefer the live editor's categories (immediate reflection) falling back
  // to the server copy at last refresh.
  const blockedCategories =
    liveBlockedCategories ?? rules?.blockedCategories ?? []

  const dailyLimit = rules?.dailyLimit
    ? parseFloat(String(rules.dailyLimit))
    : null
  const spentToday = policy ? parseFloat(policy.spentToday) : 0
  const remainingToday =
    policy?.remainingToday != null ? parseFloat(policy.remainingToday) : null

  const pct =
    dailyLimit && dailyLimit > 0
      ? Math.min(100, Math.max(0, (spentToday / dailyLimit) * 100))
      : 0
  const overLimit = dailyLimit != null && spentToday > dailyLimit

  const fmt = (n: number) => n.toFixed(2)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Spending Policy</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void fetchPolicy()}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading policy…</p>
        ) : error || !policy ? (
          <p className="text-sm text-destructive">
            Could not load the spending policy. Make sure the API is running.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Daily usage */}
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Spent today</span>
                <span className={`font-medium ${overLimit ? 'text-destructive' : ''}`}>
                  {fmt(spentToday)} {policy.currency}
                  {dailyLimit != null ? ` / ${fmt(dailyLimit)}` : ' (no daily limit)'}
                </span>
              </div>
              {dailyLimit != null && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      overLimit
                        ? 'bg-destructive'
                        : pct > 75
                          ? 'bg-amber-500'
                          : 'bg-green-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>

            {/* Remaining today */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Remaining today</span>
              {remainingToday == null ? (
                <span className="text-muted-foreground/60">no daily limit</span>
              ) : remainingToday <= 0 ? (
                <span className="font-medium text-destructive">
                  {fmt(remainingToday)} {policy.currency} (limit reached)
                </span>
              ) : (
                <span className="font-medium">
                  {fmt(remainingToday)} {policy.currency}
                </span>
              )}
            </div>

            {/* Rules */}
            <div className="grid gap-2 text-sm border-t pt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Per-transaction limit</span>
                <span>
                  {rules?.perTransactionLimit
                    ? `${parseFloat(String(rules.perTransactionLimit)).toFixed(2)} ${policy.currency}`
                    : <span className="text-muted-foreground/60">none</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Require approval above</span>
                <span>
                  {rules?.requireApprovalAbove
                    ? `${parseFloat(String(rules.requireApprovalAbove)).toFixed(2)} ${policy.currency}`
                    : <span className="text-muted-foreground/60">no approval threshold</span>}
                </span>
              </div>
            </div>

            {/* Blocked categories */}
            <div className="border-t pt-3">
              <p className="text-sm text-muted-foreground mb-2">Blocked categories</p>
              {blockedCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground/60">No categories blocked</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {blockedCategories.map((c) => (
                    <Badge key={c} variant="destructive" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Server time: {new Date(policy.serverTime).toLocaleString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
