'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Building2, Plus, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

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
    <div className="max-w-6xl mx-auto">
      <Link 
        href="/dashboard" 
        className="inline-flex items-center text-sm text-gray-600 hover:text-purple-600 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">External Bank Accounts</h1>
        <p className="text-gray-600">Manage mock external bank accounts for testing payouts</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Account Form */}
        <Card className="glass border-purple-200/50 shadow-xl">
          <CardHeader className="border-b border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl gradient-premium flex items-center justify-center">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl">Create Mock Account</CardTitle>
                <CardDescription>Add a new external bank account for testing</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-green-600">
                  {success}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="routingNumber" className="text-gray-700 font-medium">
                  Routing Number <span className="text-red-500">*</span>
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
                  className="h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500 font-mono"
                />
                <p className="text-sm text-gray-500">9 digits</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountNumber" className="text-gray-700 font-medium">
                  Account Number <span className="text-red-500">*</span>
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
                  className="h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500 font-mono"
                />
                <p className="text-sm text-gray-500">8-17 digits</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountHolder" className="text-gray-700 font-medium">
                  Account Holder <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="accountHolder"
                  type="text"
                  placeholder="John Doe"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  required
                  disabled={creating}
                  className="h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountType" className="text-gray-700 font-medium">
                  Account Type <span className="text-red-500">*</span>
                </Label>
                <Select value={accountType} onValueChange={setAccountType} disabled={creating}>
                  <SelectTrigger className="h-12 rounded-xl border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHECKING">Checking</SelectItem>
                    <SelectItem value="SAVINGS">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="initialBalance" className="text-gray-700 font-medium">
                  Initial Balance <span className="text-red-500">*</span>
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
                  className="h-12 rounded-xl border-gray-300 focus:border-purple-500 focus:ring-purple-500 font-mono"
                />
                <p className="text-sm text-gray-500">Amount in USD</p>
              </div>

              <Button
                type="submit"
                disabled={creating}
                className="w-full h-12 rounded-xl gradient-primary text-white border-0 hover:shadow-lg hover:shadow-purple-500/50 transition-all"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Account List */}
        <Card className="glass border-purple-200/50 shadow-xl">
          <CardHeader className="border-b border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl">Mock Accounts</CardTitle>
                <CardDescription>External bank accounts for testing</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No external accounts yet</p>
                <p className="text-sm text-gray-500 mt-1">Create one to start testing payouts</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => viewAccountDetails(account.routingNumber, account.accountNumber)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{account.accountHolder}</p>
                        <p className="text-sm text-gray-600 font-mono">****{account.accountNumber.slice(-4)}</p>
                      </div>
                      <Badge variant={account.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {account.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{account.accountType}</span>
                      <span className="font-semibold text-gray-900">${account.balance}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Account Details Modal */}
      {selectedAccount && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedAccount(null)}
        >
          <Card 
            className="glass border-purple-200/50 shadow-2xl max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b border-gray-200/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl gradient-premium flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Account Details</CardTitle>
                    <CardDescription>{selectedAccount.accountHolder}</CardDescription>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAccount(null)}
                  className="rounded-lg"
                >
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-gray-700 font-medium">Account Holder</Label>
                <p className="text-lg text-gray-900 mt-1">{selectedAccount.accountHolder}</p>
              </div>

              <div>
                <Label className="text-gray-700 font-medium">Routing Number</Label>
                <p className="text-lg text-gray-900 font-mono mt-1">{selectedAccount.routingNumber}</p>
              </div>

              <div>
                <Label className="text-gray-700 font-medium">Account Number</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <p className="text-lg text-gray-900 font-mono flex-1">
                    {showAccountNumber ? selectedAccount.accountNumber : `****${selectedAccount.accountNumber.slice(-4)}`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAccountNumber(!showAccountNumber)}
                    className="rounded-lg"
                  >
                    {showAccountNumber ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-700 font-medium">Account Type</Label>
                  <p className="text-lg text-gray-900 mt-1">{selectedAccount.accountType}</p>
                </div>
                <div>
                  <Label className="text-gray-700 font-medium">Status</Label>
                  <div className="mt-1">
                    <Badge variant={selectedAccount.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {selectedAccount.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-gray-700 font-medium">Balance</Label>
                <p className="text-2xl font-bold text-gray-900 mt-1">${selectedAccount.balance}</p>
              </div>

              <div>
                <Label className="text-gray-700 font-medium">Created</Label>
                <p className="text-sm text-gray-600 mt-1">
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
