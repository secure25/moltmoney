'use client'

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
}

interface TransactionListProps {
  transactions: Transaction[]
  onTransactionClick?: (tx: Transaction) => void
  pagination?: {
    page: number
    hasMore: boolean
    onPageChange: (page: number) => void
  }
}

export function TransactionList({
  transactions,
  onTransactionClick,
  pagination,
}: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No transactions found.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            onClick={() => onTransactionClick?.(tx)}
            className={`flex items-center justify-between rounded-lg border p-4 ${
              onTransactionClick ? 'cursor-pointer hover:bg-accent' : ''
            }`}
          >
            <div className="flex-1">
              <p className="font-medium">
                {tx.merchantName || tx.description || `${tx.type} transaction`}
              </p>
              <p className="text-sm text-muted-foreground">
                {new Date(tx.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="outline">{tx.type}</Badge>
              <Badge variant={tx.status === 'COMPLETED' ? 'default' : 'secondary'}>
                {tx.status}
              </Badge>
              <p className="font-medium">${parseFloat(tx.amount).toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>

      {pagination && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => pagination.onPageChange(pagination.page - 1)}
            disabled={pagination.page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pagination.page}
          </span>
          <Button
            variant="outline"
            onClick={() => pagination.onPageChange(pagination.page + 1)}
            disabled={!pagination.hasMore}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
