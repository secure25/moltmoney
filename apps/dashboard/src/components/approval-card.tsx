'use client'

import { useState } from 'react'
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
    agent?: { name: string }
  }
}

interface ApprovalCardProps {
  transaction: Transaction
  onApprove: () => Promise<void>
  onDecline: () => Promise<void>
}

export function ApprovalCard({ transaction, onApprove, onDecline }: ApprovalCardProps) {
  const [processing, setProcessing] = useState(false)

  const handleApprove = async () => {
    setProcessing(true)
    try {
      await onApprove()
    } finally {
      setProcessing(false)
    }
  }

  const handleDecline = async () => {
    setProcessing(true)
    try {
      await onDecline()
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              {transaction.merchantName || transaction.description || `${transaction.type} transaction`}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              From: {transaction.fromAccount?.agent?.name || 'Unknown'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">
              ${parseFloat(transaction.amount).toFixed(2)}
            </p>
            <Badge variant="outline">{transaction.type}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction ID:</span>
              <span className="font-mono text-xs">{transaction.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created:</span>
              <span>{new Date(transaction.createdAt).toLocaleString()}</span>
            </div>
            {transaction.merchantName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Merchant:</span>
                <span>{transaction.merchantName}</span>
              </div>
            )}
            {transaction.description && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description:</span>
                <span>{transaction.description}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleApprove}
              disabled={processing}
              className="flex-1"
            >
              {processing ? 'Processing...' : 'Approve'}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDecline}
              disabled={processing}
              className="flex-1"
            >
              {processing ? 'Processing...' : 'Decline'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
