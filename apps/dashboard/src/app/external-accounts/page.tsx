'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Plus, Eye, EyeOff, Loader2, Landmark } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/page-header'

interface ExternalAccount {
  id: string
  routingNumber: string
  accountNumber: string
  accountHolder: string
  accountType: string
  balance: string
  status: string
  createdAt: string
}

export default function ExternalAccountsPage() {
  const [accounts, setAccounts] = useState<ExternalAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedAccount, setSelectedAccount] = useState<ExternalAccount | null>(null)
  const [showAccountNumber, setShowAccountNumber] = useState(false)

  // Form state
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [accountType, setAccountType] = useState('CHECKING')
  const [initialBalance, setInitialBalance] = useState('1000.00')

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    try {
      setLoading(true)
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/external-accounts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setAccounts(data.accounts || [])
      }
    } catch (err) {
      console.error('Failed to load accounts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setCreating(true)

    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/external-accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          routingNumber,
          accountNumber,
          accountHolder,
          accountType,
          initialBalance,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'Failed to create account')
      }

      await response.json()
      setSuccess('Mock external account created successfully!')

      // Reset form
      setRoutingNumber('')
      setAccountNumber('')
      setAccountHolder('')
      setAccountType('CHECKING')
      setInitialBalance('1000.00')

      // Reload accounts
      loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setCreating(false)
    }
  }

  const viewAccountDetails = async (routing: string, account: string) => {
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/external-accounts/${routing}/${account}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        await response.json()
        // Find the full account from our list
        const fullAccount = accounts.find(
          (acc) => acc.routingNumber === routing && acc.accountNumber.endsWith(account.slice(-4))
        )
        if (fullAccount) {
          setSelectedAccount(fullAccount)
        }
      }
    } catch (err) {
      console.error('Failed to load account details:', err)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">External Accounts</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage your linked bank accounts and payout methods.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            document.getElementById('add-external-account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="gradient-primary text-white border-0 hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add External Account
        </Button>
      </div>

      {/* Account cards grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="card-surface flex flex-col items-center justify-center px-6 py-14 text-center">
          <Building2 className="mb-3 h-9 w-9 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No external accounts yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a mock external account below to start testing payouts.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="card-surface cursor-pointer p-5 transition-shadow hover:shadow-md"
              onClick={() => viewAccountDetails(account.routingNumber, account.accountNumber)}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5 text-primary">
                    <Landmark className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{account.accountHolder}</p>
                    <p className="font-num text-xs text-muted-foreground">
                      •••• {account.accountNumber.slice(-4)}
                    </p>
                  </div>
                </div>
                <StatusBadge status={account.status} />
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{account.accountType}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Available balance</p>
                  <p className="text-lg font-bold text-foreground font-num">${account.balance}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add-account form (below the grid, per wireframe) */}
      <Card id="add-external-account" className="border-border shadow-none scroll-mt-20">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-sm font-semibold text-foreground">Add Mock External Account</CardTitle>
          <CardDescription className="text-xs">
            For testing payouts only — sandbox / test account.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700" role="status">
                {success}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="routingNumber" className="text-xs text-muted-foreground">
                  Routing Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="routingNumber"
                  type="text"
                  placeholder="123456789"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value)}
                  required
                  disabled={creating}
                  maxLength={9}
                  pattern="[0-9]{9}"
                  className="h-9 font-mono"
                />
                <p className="text-xs text-muted-foreground">9 digits</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accountNumber" className="text-xs text-muted-foreground">
                  Account Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="accountNumber"
                  type="text"
                  placeholder="1234567890"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                  disabled={creating}
                  minLength={8}
                  maxLength={17}
                  pattern="[0-9]{8,17}"
                  className="h-9 font-mono"
                />
                <p className="text-xs text-muted-foreground">8–17 digits</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accountHolder" className="text-xs text-muted-foreground">
                  Account Holder <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="accountHolder"
                  type="text"
                  placeholder="John Doe"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  required
                  disabled={creating}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accountType" className="text-xs text-muted-foreground">
                  Account Type <span className="text-destructive">*</span>
                </Label>
                <Select value={accountType} onValueChange={setAccountType} disabled={creating}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHECKING">Checking</SelectItem>
                    <SelectItem value="SAVINGS">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="initialBalance" className="text-xs text-muted-foreground">
                  Initial Balance <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="initialBalance"
                  type="text"
                  placeholder="1000.00"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  required
                  disabled={creating}
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  className="h-9 font-mono"
                />
                <p className="text-xs text-muted-foreground">Amount in USD</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRoutingNumber('')
                  setAccountNumber('')
                  setAccountHolder('')
                  setAccountType('CHECKING')
                  setInitialBalance('1000.00')
                  setError('')
                  setSuccess('')
                }}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creating}
                className="gradient-primary text-white border-0 hover:opacity-90 transition-opacity"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Save Account
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Account Details Modal */}
      {selectedAccount && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedAccount(null)}
        >
          <Card
            className="shadow-2xl max-w-lg w-full bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 text-primary">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg text-foreground">Account Details</CardTitle>
                    <CardDescription className="text-xs">{selectedAccount.accountHolder}</CardDescription>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAccount(null)}
                >
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Account Holder</Label>
                <p className="mt-0.5 text-sm font-medium text-foreground">{selectedAccount.accountHolder}</p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Routing Number</Label>
                <p className="mt-0.5 font-mono text-sm text-foreground font-num">{selectedAccount.routingNumber}</p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Account Number</Label>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="flex-1 font-mono text-sm text-foreground font-num">
                    {showAccountNumber ? selectedAccount.accountNumber : `••••${selectedAccount.accountNumber.slice(-4)}`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAccountNumber(!showAccountNumber)}
                    aria-label={showAccountNumber ? 'Hide account number' : 'Show account number'}
                  >
                    {showAccountNumber ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Account Type</Label>
                  <p className="mt-0.5 text-sm font-medium text-foreground">{selectedAccount.accountType}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <StatusBadge status={selectedAccount.status} />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Balance</Label>
                <p className="mt-0.5 text-xl font-bold text-foreground font-num">${selectedAccount.balance}</p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Created</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(selectedAccount.createdAt).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
