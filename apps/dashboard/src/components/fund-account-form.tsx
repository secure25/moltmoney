'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface FundAccountFormProps {
  accountId: string
  /**
   * Presentation variant only:
   *  - default: inline form (original layout)
   *  - compact: single-line amount + button for page headers
   * Both submit identically to POST /accounts/:id/fund.
   */
  variant?: 'default' | 'compact'
}

export function FundAccountForm({ accountId, variant = 'default' }: FundAccountFormProps) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts/${accountId}/fund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to fund account')
      }

      setAmount('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fund account')
    } finally {
      setLoading(false)
    }
  }

  if (variant === 'compact') {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col items-end gap-1.5">
        {error && (
          <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
        )}
        <div className="flex items-center gap-2">
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            disabled={loading}
            aria-label="Fund amount"
            className="h-9 w-28"
          />
          <Button
            type="submit"
            size="sm"
            disabled={loading}
            className="gradient-primary text-white border-0 hover:opacity-90 transition-opacity"
          >
            {loading ? 'Processing…' : 'Fund account'}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="amount">Fund Amount</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Processing...' : 'Fund Account'}
      </Button>
    </form>
  )
}
