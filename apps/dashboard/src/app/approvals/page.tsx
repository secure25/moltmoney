'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell } from 'lucide-react'

interface Transaction {
  id: string
  amount: string
  currency: string
  type: string
  status: string
  description?: string
  merchantName?: string
  merchantCategory?: string | null
  createdAt: string
  fromAccount?: {
    id: string
    agent?: { name: string }
  }
  toAccount?: {
    agent?: { name: string }
  }
}

interface PaymentRequest {
  id: string
  amount: string
  description: string
  status: string
  createdAt: string
  expiresAt: string
  fromAccount: {
    id: string
    agent?: { name: string }
  }
}

type PendingItem =
  | { kind: 'fund-request'; id: string; title: string; agent: string; amount: string; currency: string; date: string; detail: string; payee: string; purpose: string; ruleTriggered: string; additionalContext: string }
  | { kind: 'payment'; id: string; title: string; agent: string; amount: string; currency: string; date: string; detail: string; payee: string; purpose: string; ruleTriggered: string; additionalContext: string }

export default function ApprovalsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  // Selected row for the review panel (defaults to first pending item)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    void fetchPendingItems()

    // Poll every 5 seconds as a fallback in case WebSocket doesn't work
    const pollInterval = setInterval(() => {
      void fetchPendingItems()
    }, 5000)

    return () => clearInterval(pollInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchPendingItems = async () => {
    setLoading(true)
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      // Fetch pending transactions
      const txResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/transactions?status=PENDING&approvalRequired=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (txResponse.ok) {
        const txData = await txResponse.json()
        setTransactions(txData.data || [])
      }

      // Fetch pending payment requests
      const prResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/payments/requests?status=PENDING`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (prResponse.ok) {
        const prData = await prResponse.json()
        setPaymentRequests(prData.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch pending items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (transactionId: string) => {
    setProcessingId(transactionId)
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/payments/approve/${transactionId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        setTransactions(transactions.filter((tx) => tx.id !== transactionId))
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to approve transaction')
      }
    } catch (error) {
      console.error('Failed to approve transaction:', error)
      alert('Failed to approve transaction')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDecline = async (transactionId: string) => {
    setProcessingId(transactionId)
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/payments/decline/${transactionId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        setTransactions(transactions.filter((tx) => tx.id !== transactionId))
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to decline transaction')
      }
    } catch (error) {
      console.error('Failed to decline transaction:', error)
      alert('Failed to decline transaction')
    } finally {
      setProcessingId(null)
    }
  }

  const handleApproveFundRequest = async (requestId: string) => {
    setProcessingId(requestId)
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/payments/request/${requestId}/approve`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        setPaymentRequests(paymentRequests.filter((pr) => pr.id !== requestId))
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to approve fund request')
      }
    } catch (error) {
      console.error('Failed to approve fund request:', error)
      alert('Failed to approve fund request')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDeclineFundRequest = async (requestId: string) => {
    setProcessingId(requestId)
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/payments/request/${requestId}/decline`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        setPaymentRequests(paymentRequests.filter((pr) => pr.id !== requestId))
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to decline fund request')
      }
    } catch (error) {
      console.error('Failed to decline fund request:', error)
      alert('Failed to decline fund request')
    } finally {
      setProcessingId(null)
    }
  }

  // ---- Derived presentation state (no API changes) ----
  const pendingCount = transactions.length + paymentRequests.length

  const pendingItems: PendingItem[] = [
    ...transactions.map((tx): PendingItem => ({
      kind: 'payment',
      id: tx.id,
      title: tx.merchantName || tx.description || `${tx.type} transaction`,
      agent: tx.fromAccount?.agent?.name || 'Unknown agent',
      amount: tx.amount,
      currency: tx.currency,
      date: tx.createdAt,
      detail: tx.id,
      payee: tx.merchantName || '—',
      purpose: tx.description || '—',
      // Context available from the existing payload; category doubles as the
      // rule context when present. Not a new backend requirement.
      ruleTriggered:
        tx.merchantCategory?.trim()
          ? `${tx.merchantCategory.trim()} (category requires approval)`
          : 'Spending policy (pending owner approval)',
      additionalContext: tx.toAccount?.agent?.name
        ? `Recipient account: ${tx.toAccount.agent.name}`
        : '—',
    })),
    ...paymentRequests.map((pr): PendingItem => ({
      kind: 'fund-request',
      id: pr.id,
      title: 'Fund Request',
      agent: pr.fromAccount?.agent?.name || 'Unknown agent',
      amount: pr.amount,
      currency: 'USD',
      date: pr.createdAt,
      detail: pr.id,
      payee: 'Owner (fund account)',
      purpose: pr.description || '—',
      ruleTriggered: 'Fund request approval',
      additionalContext: `Expires ${new Date(pr.expiresAt).toLocaleString()}`,
    })),
  ]

  const selected = pendingItems.find((item) => item.id === selectedId) ?? pendingItems[0] ?? null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Approvals</h1>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-white">
              {pendingCount}
            </span>
          </div>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            Agent spending may require human authorization based on your spending rules.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border shadow-none">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading…</CardContent>
          </Card>
        </div>
      ) : pendingCount === 0 ? (
        /* Wireframe empty state */
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card-surface flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(222,40%,96%)] text-muted-foreground">
              <Bell className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-foreground">No pending approvals</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              When an agent requests approval, it will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left column: pending list */}
          <div className="space-y-6">
            <Card className="border-border shadow-none">
              <CardHeader className="border-b border-border py-3">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Pending Approvals <span className="ml-1 font-normal text-muted-foreground">({pendingCount})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <ul className="space-y-1">
                  {pendingItems.map((item) => {
                    const isSelected = selected?.id === item.id
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          aria-pressed={isSelected}
                          className={`w-full rounded-lg border px-3.5 py-3 text-left transition-colors ${
                            isSelected ? 'border-primary/60 bg-[hsl(222,40%,98%)]' : 'border-transparent hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {item.agent} · {new Date(item.date).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-foreground font-num">
                                ${parseFloat(item.amount).toFixed(2)}
                              </p>
                              <span
                                className={`mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  item.kind === 'fund-request'
                                    ? 'border-purple-200 bg-purple-50 text-purple-700'
                                    : 'border-border bg-muted/50 text-muted-foreground'
                                }`}
                              >
                                {item.kind === 'fund-request' ? 'Fund request' : 'Payment'}
                              </span>
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>

            {/* Approval history: recent resolved items tease the same table language */}
            <Card className="border-border shadow-none">
              <CardHeader className="border-b border-border py-3">
                <CardTitle className="text-sm font-semibold text-foreground">Approval History</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Resolved approvals appear in{' '}
                  <a href="/transactions" className="font-medium text-primary hover:underline">
                    Transactions
                  </a>{' '}
                  with their final status (Approved / Declined).
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right column: review panel */}
          <div>
            {selected && (
              <Card className="border-border shadow-none">
                <CardHeader className="border-b border-border py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-foreground">Review Request</CardTitle>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        selected.kind === 'fund-request'
                          ? 'border-purple-200 bg-purple-50 text-purple-700'
                          : 'border-border bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      {selected.kind === 'fund-request' ? 'Fund request' : 'Payment'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agent</span>
                      <span className="font-medium text-foreground">{selected.agent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payee</span>
                      <span className="font-medium text-foreground">{selected.payee}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Purpose</span>
                      <span className="max-w-[60%] truncate text-right font-medium text-foreground">{selected.purpose}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Requested</span>
                      <span className="font-medium text-foreground">{new Date(selected.date).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-2xl font-bold text-foreground font-num">
                      ${parseFloat(selected.amount).toFixed(2)}{' '}
                      <span className="text-sm font-medium text-muted-foreground">{selected.currency}</span>
                    </p>
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rule triggered</span>
                      <span className="max-w-[60%] truncate text-right font-medium text-foreground">{selected.ruleTriggered}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Additional context</span>
                      <span className="max-w-[60%] truncate text-right font-medium text-foreground">{selected.additionalContext}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reference</span>
                      <span className="font-mono text-xs text-muted-foreground">{selected.detail}</span>
                    </div>
                  </div>

                  {/* Exact existing handlers, disabled states, and alerts preserved */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1 border-border text-foreground hover:bg-muted"
                      disabled={processingId === selected.id}
                      onClick={() =>
                        selected.kind === 'fund-request'
                          ? handleDeclineFundRequest(selected.id)
                          : handleDecline(selected.id)
                      }
                    >
                      {processingId === selected.id ? 'Processing…' : 'Decline'}
                    </Button>
                    <Button
                      className="flex-1 gradient-primary text-white border-0 hover:opacity-90 transition-opacity"
                      disabled={processingId === selected.id}
                      onClick={() =>
                        selected.kind === 'fund-request'
                          ? handleApproveFundRequest(selected.id)
                          : handleApprove(selected.id)
                      }
                    >
                      {processingId === selected.id ? 'Processing…' : 'Approve'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
