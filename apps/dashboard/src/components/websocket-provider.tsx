'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { websocketClient } from '@/lib/websocket'
import { useToast } from '@/hooks/use-toast'

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const token = document.cookie
      .split('; ')
      .find((row) => row.startsWith('token='))
      ?.split('=')[1]

    if (!token) return

    websocketClient.connect(token)

    // Handle balance updates
    const handleBalanceUpdate = () => {
      router.refresh()
    }

    // Handle new transactions
    const handleTransactionCreated = () => {
      router.refresh()
    }

    // Handle approval required
    const handleApprovalRequired = (event: any) => {
      toast({
        title: 'Approval Required',
        description: `A transaction of $${parseFloat(event.data.amount).toFixed(2)} requires your approval`,
      })
      router.refresh()
    }

    // Handle payment requests
    const handlePaymentRequest = (event: any) => {
      toast({
        title: 'Payment Request Received',
        description: `New payment request for $${parseFloat(event.data.amount).toFixed(2)}`,
      })
      router.refresh()
    }

    websocketClient.on('balance.updated', handleBalanceUpdate)
    websocketClient.on('transaction.created', handleTransactionCreated)
    websocketClient.on('approval.required', handleApprovalRequired)
    websocketClient.on('payment_request.received', handlePaymentRequest)

    return () => {
      websocketClient.off('balance.updated', handleBalanceUpdate)
      websocketClient.off('transaction.created', handleTransactionCreated)
      websocketClient.off('approval.required', handleApprovalRequired)
      websocketClient.off('payment_request.received', handlePaymentRequest)
      websocketClient.disconnect()
    }
  }, [router, toast])

  return <>{children}</>
}
