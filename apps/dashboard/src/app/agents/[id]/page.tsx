import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FundAccountForm } from '@/components/fund-account-form'
import { SpendingPolicySection } from '@/components/spending-policy-section'

interface Agent {
  id: string
  name: string
  platform: string
  account: {
    id: string
    accountNumber?: string
    balance: string
    currency: string
    status: string
    spendingRules: any
  }
}

interface VirtualCard {
  id: string
  cardNumber: string
  expiryMonth: number
  expiryYear: number
  status: string
  spendLimit?: string
}

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

async function getAgent(id: string): Promise<Agent | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value

  // Get all accounts and find the one with matching agent ID
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    return null
  }

  const accounts = await response.json() as Array<{agent?: {id: string; name: string; platform: string}; id: string; balance: string; currency: string; status: string}>
  const account = accounts.find((acc) => acc.agent?.id === id)
  
  if (!account || !account.agent) {
    return null
  }

  // Get full account details including spending rules
  const accountDetailResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts/${account.id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })

  if (!accountDetailResponse.ok) {
    return null
  }

  const accountDetail = await accountDetailResponse.json() as {accountNumber?: string; spendingRules: any}

  return {
    id: account.agent.id,
    name: account.agent.name,
    platform: account.agent.platform,
    account: {
      id: account.id,
      accountNumber: accountDetail.accountNumber,
      balance: account.balance,
      currency: account.currency,
      status: account.status,
      spendingRules: accountDetail.spendingRules,
    },
  }
}

async function getVirtualCards(accountId: string): Promise<VirtualCard[]> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/cards?accountId=${accountId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    // API returns { cards: [...] }
    return Array.isArray(data.cards) ? data.cards : []
  } catch {
    return []
  }
}

async function getTransactions(accountId: string): Promise<Transaction[]> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/transactions?accountId=${accountId}&pageSize=10`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return Array.isArray(data.data) ? data.data : []
  } catch {
    return []
  }
}

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  const agent = await getAgent(params.id)

  if (!agent) {
    notFound()
  }

  const cards = await getVirtualCards(agent.account.id)
  const transactions = await getTransactions(agent.account.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{agent.name}</h1>
          <p className="text-muted-foreground">{agent.platform}</p>
        </div>
        <Badge variant={agent.account.status === 'ACTIVE' ? 'default' : 'secondary'}>
          {agent.account.status}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${parseFloat(agent.account.balance).toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground">{agent.account.currency}</p>
            
            <div className="mt-4 space-y-3">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Account ID (for API)</p>
                <p className="font-mono text-sm break-all">{agent.account.id}</p>
              </div>
              
              {agent.account.accountNumber && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Account Number (for receiving payments)</p>
                  <p className="font-mono text-sm">{agent.account.accountNumber}</p>
                </div>
              )}
            </div>
            
            <div className="mt-4">
              <FundAccountForm accountId={agent.account.id} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendingPolicySection
              accountId={agent.account.id}
              initialRules={agent.account.spendingRules || {}}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Virtual Cards</CardTitle>
        </CardHeader>
        <CardContent>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No virtual cards issued yet.</p>
          ) : (
            <div className="space-y-4">
              {cards.map((card) => (
                <div key={card.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Card Number</p>
                      <p className="font-mono text-lg font-medium">{card.cardNumber}</p>
                    </div>
                    <Badge variant={card.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {card.status}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Expiry Date</p>
                      <p className="font-mono text-sm">{String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}</p>
                    </div>
                    {card.spendLimit && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Spend Limit</p>
                        <p className="font-mono text-sm">${parseFloat(card.spendLimit).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">Card ID: {card.id}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="space-y-4">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <div>
                    <p className="font-medium">
                      {tx.merchantName || tx.description || `${tx.type} transaction`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${parseFloat(tx.amount).toFixed(2)}</p>
                    <Badge variant={tx.status === 'COMPLETED' ? 'default' : 'secondary'}>
                      {tx.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
