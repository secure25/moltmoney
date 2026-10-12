'use client'

import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/page-header'

interface Transaction {
  id: string
  amount: string
  currency: string
  type: string
  status: string
  description?: string
  merchantName?: string
  merchantCategory?: string | null
  providerName?: string | null
  providerRefId?: string | null
  createdAt: string
  fromAccount?: { agent?: { name: string } }
  toAccount?: { agent?: { name: string } }
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  // Blocked categories come from the first visible account's spending
  // policy (repo convention: agent accounts are per-owner here). Null
  // while loading; [] when the account has no restrictions.
  const [blockedCategories, setBlockedCategories] = useState<string[] | null>(null)
  
  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const pageSize = 20

  useEffect(() => {
    void fetchTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, typeFilter, statusFilter, startDate, endDate])

  const fetchTransactions = async () => {
    setLoading(true)
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })

      if (typeFilter !== 'all') params.append('type', typeFilter)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/transactions?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        const data = await response.json()
        setTransactions(data.data || [])
        setTotal(data.total || 0)
        setHasMore(data.hasMore || false)
        void fetchBlockedCategories()
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch the account's spending policy for the blocked-categories digest
  // used to highlight restricted rows. Best-effort: a failure (no accounts,
  // policy endpoint unavailable) simply disables the highlight, matching
  // the fetch conventions of the rest of this page.
  const fetchBlockedCategories = async () => {
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const accountsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!accountsRes.ok) {
        setBlockedCategories([])
        return
      }
      const accounts = await accountsRes.json()
      const firstAccount = Array.isArray(accounts) ? accounts[0] : null
      if (!firstAccount?.id) {
        setBlockedCategories([])
        return
      }

      const policyRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/accounts/${firstAccount.id}/spending-policy`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!policyRes.ok) {
        setBlockedCategories([])
        return
      }
      const policy = await policyRes.json()
      const blocked = policy?.rules?.blockedCategories
      setBlockedCategories(Array.isArray(blocked) ? blocked : [])
    } catch {
      setBlockedCategories([])
    }
  }

  const isBlocked = (tx: Transaction): boolean => {
    if (!blockedCategories || blockedCategories.length === 0) return false
    const category = tx.merchantCategory?.trim()
    if (!category) return false
    // Case-insensitive to mirror spending-policy's exact-match check.
    return blockedCategories.some(
      (b) => b.trim().toLowerCase() === category.toLowerCase()
    )
  }

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const params = new URLSearchParams({ format })
      if (typeFilter !== 'all') params.append('type', typeFilter)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/transactions/export?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `transactions.${format}`
        a.click()
      }
    } catch (error) {
      console.error('Failed to export transactions:', error)
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Transactions</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            View and manage all transactions across your accounts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('json')}>
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Horizontal filter row */}
      <Card className="border-border shadow-none">
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date range</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9"
                  aria-label="Start date"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9"
                  aria-label="End date"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="INTERNAL">Internal</SelectItem>
                  <SelectItem value="INBOUND">Inbound</SelectItem>
                  <SelectItem value="OUTBOUND">Outbound</SelectItem>
                  <SelectItem value="PAYOUT">Payout</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="DECLINED">Declined</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Input type="text" disabled placeholder="All categories" className="h-9" />
            </div>
            <div className="flex items-end">
              <Input
                type="text"
                placeholder="Search merchant, agent, or ID…"
                className="h-9"
                disabled
                aria-label="Search transactions"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-none overflow-hidden">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-sm font-semibold text-foreground">
            Transactions {total > 0 && <span className="ml-1 text-muted-foreground font-normal">({total})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">Loading transactions…</div>
          ) : transactions.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No transactions found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try adjusting the filters above — nothing matches the current criteria.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Date/time</th>
                      <th className="px-4 py-2.5 font-medium">Merchant / Description</th>
                      <th className="px-4 py-2.5 font-medium">Agent</th>
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="px-4 py-2.5 font-medium">Tx ID</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      // Extract recipient info for PAYOUT transactions
                      const isPayout = tx.type === 'PAYOUT'
                      const recipientName = isPayout ? tx.merchantName : null
                      const maskedAccount = isPayout && tx.description
                        ? tx.description.match(/\*{4}\d{4}/)?.[0]
                        : null

                      // Category display: legacy rows have no category — show a
                      // muted 'uncategorized' rather than nothing or an error.
                      const category = tx.merchantCategory?.trim()
                      const blocked = isBlocked(tx)

                      const agentName =
                        tx.fromAccount?.agent?.name || tx.toAccount?.agent?.name || '—'

                      return (
                        <tr
                          key={tx.id}
                          onClick={() => setSelectedTx(tx)}
                          className={`cursor-pointer border-b border-border/60 hover:bg-muted/40 ${
                            blocked ? 'bg-destructive/5' : ''
                          }`}
                        >
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                            {fmtDate(tx.createdAt)}
                          </td>
                          <td className="max-w-[200px] px-4 py-2.5">
                            <p className="truncate font-medium text-foreground">
                              {isPayout && recipientName
                                ? `Payout to ${recipientName}`
                                : tx.merchantName || tx.description || `${tx.type} transaction`}
                            </p>
                            {isPayout && maskedAccount && (
                              <p className="truncate text-xs text-muted-foreground font-num">{maskedAccount}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-foreground">{agentName}</td>
                          <td className="px-4 py-2.5">
                            <Badge
                              variant="outline"
                              className={
                                blocked
                                  ? 'border-destructive bg-red-50 text-destructive'
                                  : category
                                    ? 'border-border bg-muted/50 text-muted-foreground'
                                    : 'border-transparent bg-transparent text-muted-foreground/50'
                              }
                            >
                              {blocked ? `⛔ ${category}` : category || 'uncategorized'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {tx.id.slice(0, 8)}…
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={tx.status} />
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-semibold font-num ${
                              tx.type === 'INBOUND' ? 'text-emerald-600' : 'text-foreground'
                            }`}
                          >
                            {tx.type === 'INBOUND' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              {selectedTx?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedTx && (
            <div className="space-y-4">
              <div>
                <Label>Amount</Label>
                <p className="text-2xl font-bold">
                  ${parseFloat(selectedTx.amount).toFixed(2)} {selectedTx.currency}
                </p>
              </div>
              <div>
                <Label>Type</Label>
                <p>{selectedTx.type}</p>
              </div>
              <div>
                <Label>Status</Label>
                <Badge variant={
                  selectedTx.status === 'COMPLETED' ? 'default' : 
                  selectedTx.status === 'PENDING' ? 'secondary' :
                  selectedTx.status === 'FAILED' ? 'destructive' :
                  selectedTx.status === 'APPROVED' ? 'default' :
                  selectedTx.status === 'DECLINED' ? 'destructive' :
                  'secondary'
                }>
                  {selectedTx.status}
                </Badge>
              </div>
              {selectedTx.type === 'PAYOUT' && selectedTx.merchantName && (
                <div>
                  <Label>Recipient</Label>
                  <p>{selectedTx.merchantName}</p>
                </div>
              )}
              {selectedTx.type === 'PAYOUT' && selectedTx.description && (
                <div>
                  <Label>Recipient Account</Label>
                  <p>{selectedTx.description.match(/\*{4}\d{4}/)?.[0] || 'N/A'}</p>
                </div>
              )}
              {selectedTx.type !== 'PAYOUT' && selectedTx.merchantName && (
                <div>
                  <Label>Merchant</Label>
                  <p>{selectedTx.merchantName}</p>
                </div>
              )}
              <div>
                <Label>Category</Label>
                <div className="flex items-center gap-2">
                  {isBlocked(selectedTx) ? (
                    <Badge variant="destructive">⛔ {selectedTx.merchantCategory?.trim()} — blocked by spending policy</Badge>
                  ) : selectedTx.merchantCategory?.trim() ? (
                    <Badge variant="outline">{selectedTx.merchantCategory.trim()}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground/60">uncategorized</span>
                  )}
                </div>
              </div>
              {selectedTx.description && (
                <div>
                  <Label>Description</Label>
                  <p>{selectedTx.description}</p>
                </div>
              )}
              {selectedTx.providerName && (
                <div>
                  <Label>Provider</Label>
                  <p className="text-sm">
                    {selectedTx.providerName}
                    {selectedTx.providerRefId ? ` · ${selectedTx.providerRefId}` : ''}
                  </p>
                </div>
              )}
              <div>
                <Label>Created At</Label>
                <p>{new Date(selectedTx.createdAt).toLocaleString()}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
