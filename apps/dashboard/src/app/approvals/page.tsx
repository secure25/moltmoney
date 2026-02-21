'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Transaction {
  id: string
  amount: string
  currency: string
  type: string
  status: string
  description?: string
  merchantName?: string
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

export default function ApprovalsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Pending Approvals</h1>
        <Badge>{transactions.length + paymentRequests.length} pending</Badge>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      ) : transactions.length === 0 && paymentRequests.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              No pending approvals. All transactions are up to date!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Fund Requests Section */}
          {paymentRequests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Fund Requests</h2>
              {paymentRequests.map((pr) => (
                <Card key={pr.id} className="border-purple-200">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">Fund Request</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          From: {pr.fromAccount?.agent?.name || 'Unknown'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-purple-600">
                          ${parseFloat(pr.amount).toFixed(2)}
                        </p>
                        <Badge variant="outline" className="border-purple-300">FUND REQUEST</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Request ID:</span>
                          <span className="font-mono text-xs">{pr.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created:</span>
                          <span>{new Date(pr.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expires:</span>
                          <span>{new Date(pr.expiresAt).toLocaleString()}</span>
                        </div>
                        {pr.description && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Reason:</span>
                            <span>{pr.description}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApproveFundRequest(pr.id)}
                          disabled={processingId === pr.id}
                          className="flex-1 bg-purple-600 hover:bg-purple-700"
                        >
                          {processingId === pr.id ? 'Processing...' : 'Approve & Fund'}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleDeclineFundRequest(pr.id)}
                          disabled={processingId === pr.id}
                          className="flex-1"
                        >
                          {processingId === pr.id ? 'Processing...' : 'Decline'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Transactions Section */}
          {transactions.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Payment Approvals</h2>
              {transactions.map((tx) => (
            <Card key={tx.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {tx.merchantName || tx.description || `${tx.type} transaction`}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      From: {tx.fromAccount?.agent?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      ${parseFloat(tx.amount).toFixed(2)}
                    </p>
                    <Badge variant="outline">{tx.type}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Transaction ID:</span>
                      <span className="font-mono text-xs">{tx.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span>{new Date(tx.createdAt).toLocaleString()}</span>
                    </div>
                    {tx.merchantName && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Merchant:</span>
                        <span>{tx.merchantName}</span>
                      </div>
                    )}
                    {tx.description && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Description:</span>
                        <span>{tx.description}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApprove(tx.id)}
                      disabled={processingId === tx.id}
                      className="flex-1"
                    >
                      {processingId === tx.id ? 'Processing...' : 'Approve'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleDecline(tx.id)}
                      disabled={processingId === tx.id}
                      className="flex-1"
                    >
                      {processingId === tx.id ? 'Processing...' : 'Decline'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
