import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FundAccountForm } from '@/components/fund-account-form'
import { SpendingPolicySection } from '@/components/spending-policy-section'
import { CopyButton } from '@/components/copy-button'
import { StatusBadge } from '@/components/page-header'

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
      {/* Breadcrumb */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span aria-hidden>‹</span> Agents
      </Link>

      {/* Page heading: avatar, name, status; actions on the right */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="gradient-primary flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white">
            {agent.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{agent.name}</h1>
              <StatusBadge status={agent.account.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              AI agent for research, learning and purchases · {agent.platform}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* FundAccountForm is the real funding control (modal trigger) */}
          <FundAccountForm accountId={agent.account.id} variant="compact" />
        </div>
      </div>

      {/* Account overview row */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card-surface p-5">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Balance</p>
          <p className="text-3xl font-bold text-foreground font-num">
            ${parseFloat(agent.account.balance).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">{agent.account.currency}</p>
          <Link
            href="/transactions"
            className="mt-3 inline-flex text-xs font-medium text-primary hover:underline"
          >
            View transactions →
          </Link>
        </div>

        <div className="card-surface p-5">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Account ID</p>
          <p className="truncate font-mono text-xs text-foreground" title={agent.account.id}>
            {agent.account.id}
          </p>
          <div className="mt-2">
            <CopyButton value={agent.account.id} label="Copy" />
          </div>
        </div>

        <div className="card-surface p-5">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Account Number</p>
          <p className="font-mono text-sm text-foreground font-num">
            {agent.account.accountNumber || 'Not issued'}
          </p>
          {agent.account.accountNumber && (
            <div className="mt-2">
              <CopyButton value={agent.account.accountNumber} label="Copy" />
            </div>
          )}
        </div>
      </div>

      {/* Spending Policy + Utilization (existing components) */}
      <SpendingPolicySection
        accountId={agent.account.id}
        initialRules={agent.account.spendingRules || {}}
      />

      {/* Virtual Cards */}
      <Card className="border-border shadow-none">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-sm font-semibold text-foreground">Virtual Cards</CardTitle>
        </CardHeader>
        <CardContent>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No virtual cards issued yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <div key={card.id} className="rounded-xl border border-border bg-[hsl(222,47%,15%)] p-5 text-white space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-base tracking-wider">{card.cardNumber}</p>
                    <StatusBadge status={card.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-white/60">Expires</p>
                      <p className="font-mono font-medium">
                        {String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}
                      </p>
                    </div>
                    {card.spendLimit && (
                      <div>
                        <p className="text-white/60">Spend limit</p>
                        <p className="font-mono font-medium font-num">${parseFloat(card.spendLimit).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                  <p className="border-t border-white/10 pt-2 font-mono text-[10px] text-white/50">
                    Card ID: {card.id}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card className="border-border shadow-none overflow-hidden">
        <CardHeader className="border-b border-border py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Recent Transactions</CardTitle>
            <Link href="/transactions" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Merchant / Description</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isInbound = tx.type === 'INBOUND'
                    return (
                      <tr key={tx.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="max-w-[220px] px-4 py-2.5">
                          <p className="truncate font-medium text-foreground">
                            {tx.merchantName || tx.description || `${tx.type} transaction`}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={tx.status} />
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-semibold font-num ${
                            isInbound ? 'text-emerald-600' : 'text-foreground'
                          }`}
                        >
                          {isInbound ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
