'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SpendingRulesEditorProps {
  accountId: string
  initialRules: {
    dailyLimit?: string | number
    perTransactionLimit?: string | number
    blockedCategories?: string[]
    requireApprovalAbove?: string | number
  }
  /** Optional: called on every blockedCategories text change (live list). */
  onBlockedCategoriesChange?: (categories: string[] | null) => void
  /** Optional: called with the saved rules after a successful PATCH. */
  onRulesSaved?: () => void
}

export function SpendingRulesEditor({
  accountId,
  initialRules,
  onBlockedCategoriesChange,
  onRulesSaved,
}: SpendingRulesEditorProps) {
  const router = useRouter()
  const [dailyLimit, setDailyLimit] = useState(
    initialRules.dailyLimit != null ? String(initialRules.dailyLimit) : ''
  )
  const [perTransactionLimit, setPerTransactionLimit] = useState(
    initialRules.perTransactionLimit != null ? String(initialRules.perTransactionLimit) : ''
  )
  const [requireApprovalAbove, setRequireApprovalAbove] = useState(
    initialRules.requireApprovalAbove != null ? String(initialRules.requireApprovalAbove) : ''
  )
  const [blockedCategories, setBlockedCategories] = useState(
    initialRules.blockedCategories?.join(', ') || ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)

    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const rules: any = {}
      if (dailyLimit) rules.dailyLimit = dailyLimit
      if (perTransactionLimit) rules.perTransactionLimit = perTransactionLimit
      if (requireApprovalAbove) rules.requireApprovalAbove = requireApprovalAbove
      if (blockedCategories) {
        rules.blockedCategories = blockedCategories.split(',').map((c) => c.trim()).filter(Boolean)
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts/${accountId}/rules`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(rules),
      })

      if (!response.ok) {
        interface ApiErrorShape {
          error?: {
            message?: string
            details?: Array<{ path?: string[]; message?: string }>
          }
          message?: string
        }
        const data: ApiErrorShape | null = await response
          .json()
          .catch(() => null)
        // Surface Zod details when present (e.g. "Must be a valid amount …")
        const zodDetail = data?.error?.details
          ? data.error.details
              .map((d) => `${d.path?.join('.')}: ${d.message}`)
              .join('; ')
          : null
        const detail =
          data?.error?.message || data?.message || 'Failed to update rules'
        throw new Error(zodDetail || detail)
      }

      setSuccess(true)
      onRulesSaved?.()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rules')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Rules updated successfully
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="dailyLimit">Daily Limit</Label>
        <Input
          id="dailyLimit"
          type="number"
          step="0.01"
          placeholder="No limit"
          value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)}
          disabled={loading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="perTransactionLimit">Per Transaction Limit</Label>
        <Input
          id="perTransactionLimit"
          type="number"
          step="0.01"
          placeholder="No limit"
          value={perTransactionLimit}
          onChange={(e) => setPerTransactionLimit(e.target.value)}
          disabled={loading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="requireApprovalAbove">Require Approval Above</Label>
        <Input
          id="requireApprovalAbove"
          type="number"
          step="0.01"
          placeholder="No approval required"
          value={requireApprovalAbove}
          onChange={(e) => setRequireApprovalAbove(e.target.value)}
          disabled={loading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="blockedCategories">Blocked Categories (comma-separated)</Label>
        <Input
          id="blockedCategories"
          type="text"
          placeholder="e.g., gambling, alcohol"
          value={blockedCategories}
          onChange={(e) => {
            setBlockedCategories(e.target.value)
            // Mirror the parsed list live (null while unchecked/empty so the
            // panel falls back to the server's authoritative copy).
            const parsed = e.target.value
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean)
            onBlockedCategoriesChange?.(parsed.length > 0 || e.target.value.trim() !== '' ? parsed : null)
          }}
          disabled={loading}
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Saving...' : 'Save Rules'}
      </Button>
    </form>
  )
}
