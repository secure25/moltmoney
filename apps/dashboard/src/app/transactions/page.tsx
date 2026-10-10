'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Transactions</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport('csv')}>
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => handleExport('json')}>
            Export JSON
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Transactions ({total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground">Loading...</p>
          ) : transactions.length === 0 ? (
            <p className="text-center text-muted-foreground">No transactions found.</p>
          ) : (
            <>
              <div className="space-y-4">
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

                  return (
                    <div
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-4 hover:bg-accent ${
                        blocked ? 'border-destructive bg-destructive/5' : ''
                      }`}
                    >
                      <div className="flex-1">
                        <p className="font-medium">
                          {isPayout && recipientName 
                            ? `Payout to ${recipientName}`
                            : tx.merchantName || tx.description || `${tx.type} transaction`}
                        </p>
                        {isPayout && maskedAccount && (
                          <p className="text-sm text-muted-foreground">
                            Account: {maskedAccount}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {/* Category badge: distinct when blocked, muted when
                            absent (legacy rows), plain otherwise. */}
                        <Badge
                          variant="outline"
                          className={
                            blocked
                              ? 'border-destructive text-destructive'
                              : category
                                ? ''
                                : 'text-muted-foreground/60'
                          }
                        >
                          {blocked ? `⛔ ${category}` : category || 'uncategorized'}
                        </Badge>
                        <Badge variant={isPayout ? 'default' : 'outline'}>
                          {tx.type}
                        </Badge>
                        <Badge variant={
                          tx.status === 'COMPLETED' ? 'default' : 
                          tx.status === 'PENDING' ? 'secondary' :
                          tx.status === 'FAILED' ? 'destructive' :
                          'secondary'
                        }>
                          {tx.status}
                        </Badge>
                        <p className="font-medium">${parseFloat(tx.amount).toFixed(2)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page}
                </span>
                <Button
                  variant="outline"
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
