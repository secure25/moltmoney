'use client'

import { useState } from 'react'
import { SpendingRulesEditor } from '@/components/spending-rules-editor'
import { SpendingPolicyPanel } from '@/components/spending-policy-panel'

/**
 * Client wrapper binding the rules editor and the server-authoritative
 * policy panel together:
 *
 *  - Every keystroke in the editor's blockedCategories field is mirrored
 *    into the panel immediately (before any save).
 *  - A successful PATCH bumps refreshKey, which re-fetches the policy from
 *    the server (fresh spentToday/remainingToday + saved rules).
 */
export function SpendingPolicySection({
  accountId,
  initialRules,
}: {
  accountId: string
  initialRules: {
    dailyLimit?: string | number
    perTransactionLimit?: string | number
    blockedCategories?: string[]
    requireApprovalAbove?: string | number
  }
}) {
  const [liveBlocked, setLiveBlocked] = useState<string[] | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SpendingRulesEditor
        accountId={accountId}
        initialRules={initialRules}
        onBlockedCategoriesChange={(categories) => setLiveBlocked(categories)}
        onRulesSaved={() => {
          // Drop the live mirror: the server copy is now authoritative.
          setLiveBlocked(null)
          setRefreshKey((k) => k + 1)
        }}
      />
      <SpendingPolicyPanel
        accountId={accountId}
        refreshSignal={refreshKey}
        liveBlockedCategories={liveBlocked}
      />
    </div>
  )
}
