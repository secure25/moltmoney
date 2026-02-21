'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface BalanceCardProps {
  account: {
    id: string
    balance: string
    currency: string
    status: string
  }
  onFreeze?: () => void
}

export function BalanceCard({ account, onFreeze }: BalanceCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleFreeze = async () => {
    if (!onFreeze) return
    setLoading(true)
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1]

      const endpoint = account.status === 'ACTIVE' ? 'freeze' : 'unfreeze'
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/accounts/${account.id}/${endpoint}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        router.refresh()
      }
    } catch (error) {
      console.error('Failed to update account status:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Account Balance</CardTitle>
          <Badge variant={account.status === 'ACTIVE' ? 'default' : 'secondary'}>
            {account.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="text-3xl font-bold">
              ${parseFloat(account.balance).toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground">{account.currency}</p>
          </div>
          <div className="flex gap-2">
            {onFreeze && (
              <Button
                variant="outline"
                onClick={handleFreeze}
                disabled={loading}
                className="flex-1"
              >
                {account.status === 'ACTIVE' ? 'Freeze' : 'Unfreeze'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
