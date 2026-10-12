import { cookies } from 'next/headers'
import Link from 'next/link'
import { Wallet, Users, Bell, Plus, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react'
import { PageHeader, StatusBadge } from '@/components/page-header'
import { Button } from '@/components/ui/button'

interface Account {
  id: string
  balance: string
  currency: string
  status: string
  agent?: {
    id: string
    name: string
    platform: string
  }
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
  fromAccount?: { agent?: { name: string } }
  toAccount?: { agent?: { name: string } }
}

interface Policy {
  accountId: string
  currency: string
  rules: {
    dailyLimit?: string | number | null
  } | null
  spentToday: string
  remainingToday: string | null
  serverTime: string
}

async function getAccounts(): Promise<Account[]> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return []
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('Failed to fetch accounts:', response.status)
      return []
    }

    return response.json()
  } catch (error) {
    console.error('Error fetching accounts:', error)
    return []
  }
}

async function getRecentTransactions(): Promise<Transaction[]> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return []
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/transactions?pageSize=10`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('Failed to fetch transactions:', response.status)
      return []
    }

    const data = await response.json()
    return data.data || []
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
}

async function getPendingApprovals(): Promise<number> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return 0
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/transactions?status=PENDING`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('Failed to fetch pending approvals:', response.status)
      return 0
    }

    const data = await response.json()
    return data.total || 0
  } catch (error) {
    console.error('Error fetching pending approvals:', error)
    return 0
  }
}

/**
 * Spent Today comes from the server-authoritative spending-policy endpoint
 * (the same aggregation the enforcement engine uses) — the dashboard never
 * recomputes spending itself. Uses the first agent account (repo convention:
 * agent accounts are per-owner). A failure keeps the card in its loading/
 * empty-safe state rather than inventing a value.
 */
async function getSpentToday(firstAccountId: string | null): Promise<Policy | null> {
  if (!firstAccountId) return null
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return null
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/accounts/${firstAccountId}/spending-policy`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      console.error('Failed to fetch spending policy:', response.status)
      return null
    }

    return response.json()
  } catch (error) {
    console.error('Error fetching spending policy:', error)
    return null
  }
}

export default async function DashboardPage() {
  const accounts = await getAccounts()
  const recentTransactions = await getRecentTransactions()
  const pendingCount = await getPendingApprovals()
  const policy = await getSpentToday(accounts[0]?.id ?? null)

  const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0)
  const activeAgents = accounts.filter((a) => a.status === 'ACTIVE').length

  // Trend: derive a simple balance-and-activity view from the transactions
  // that already exist (no invented history). Points are cumulative signed
  // volume over the recent window, most recent last.
  const trendTx = recentTransactions
    .slice()
    .reverse()
    .slice(-10)
  const trendPoints = trendTx.map((tx, i) => {
    const prev = i === 0 ? 0 : cumulative(trendTx, i - 1)
    const cur = cumulative(trendTx, i)
    return { label: new Date(tx.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), prev, cur }
  })
  function cumulative(txs: Transaction[], upTo: number): number {
    let sum = 0
    for (let i = 0; i <= upTo; i++) {
      const t = txs[i]
      sum += (t.type === 'INBOUND' ? 1 : -1) * Math.abs(parseFloat(t.amount))
    }
    return sum
  }
  const trendMax = Math.max(...trendPoints.map((p) => Math.abs(p.cur) || 1), 1)
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        subtitle="Your AI agent financial overview"
        actions={
          <>
            <Link href="/external-accounts">
              <Button variant="outline" size="sm">
                <Wallet className="h-4 w-4 mr-2" />
                Add Funds
              </Button>
            </Link>
            <Link href="/agents/new">
              <Button size="sm" className="gradient-primary text-white border-0 hover:opacity-90 transition-opacity">
                <Plus className="h-4 w-4 mr-2" />
                Create Agent
              </Button>
            </Link>
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card-surface p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(222,40%,96%)] text-primary">
              <Wallet className="h-4.5 w-4.5" />
            </span>
            <p className="text-xs font-medium text-muted-foreground">Total Balance</p>
          </div>
          <p className="text-2xl font-bold text-foreground font-num">
            ${totalBalance.toFixed(2)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">USD</p>
        </div>

        <div className="card-surface p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(222,40%,96%)] text-emerald-600">
              <Users className="h-4.5 w-4.5" />
            </span>
            <p className="text-xs font-medium text-muted-foreground">Active Agents</p>
          </div>
          <p className="text-2xl font-bold text-foreground font-num">{activeAgents}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">of {accounts.length} total</p>
        </div>

        <div className="card-surface p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(222,40%,96%)] text-amber-600">
              <Bell className="h-4.5 w-4.5" />
            </span>
            <p className="text-xs font-medium text-muted-foreground">Pending Approvals</p>
          </div>
          <p className="text-2xl font-bold text-foreground font-num">{pendingCount}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pendingCount > 0 ? 'require attention' : 'all clear'}
          </p>
        </div>

        <div className="card-surface p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(222,40%,96%)] text-primary">
              <Clock className="h-4.5 w-4.5" />
            </span>
            <p className="text-xs font-medium text-muted-foreground">Spent Today</p>
          </div>
          {policy ? (
            <>
              <p className="text-2xl font-bold text-foreground font-num">
                ${parseFloat(policy.spentToday).toFixed(2)}
              </p>
              {policy.rules?.dailyLimit != null && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="presentation">
                    <div
                      className="h-full rounded-full gradient-primary"
                      style={{
                        width: `${Math.min(
                          100,
                          (parseFloat(policy.spentToday) / Math.max(parseFloat(String(policy.rules.dailyLimit)), 0.01)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    of ${parseFloat(String(policy.rules.dailyLimit)).toFixed(2)} limit
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-2xl font-bold text-muted-foreground font-num">—</p>
          )}
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left column: trend + agent accounts */}
        <div className="space-y-6 lg:col-span-3">
          <div className="card-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Balance &amp; Activity Trend</h2>
            {trendPoints.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No activity yet — once agents transact, the trend appears here.
              </p>
            ) : (
              <div className="relative h-44">
                <svg
                  viewBox={`0 0 100 100`}
                  preserveAspectRatio="none"
                  className="h-full w-full overflow-visible"
                  aria-hidden
                >
                  {[25, 50, 75].map((y) => (
                    <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="hsl(220 29% 92%)" strokeWidth="0.5" />
                  ))}
                  <polyline
                    fill="none"
                    stroke="hsl(262 83% 58%)"
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                    points={trendPoints
                      .map(
                        (p, i) =>
                          `${(i / Math.max(trendPoints.length - 1, 1)) * 100},${
                            100 - ((p.cur + trendMax) / (2 * trendMax)) * 100
                          }`
                      )
                      .join(' ')}
                  />
                </svg>
                <div className="absolute inset-x-0 -bottom-5 flex justify-between text-[10px] text-muted-foreground">
                  {trendPoints.map((p, i) => (
                    <span key={i} className="truncate">
                      {p.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Agent Accounts</h2>
              <Link href="/agents/new" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="p-2">
              {accounts.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">
                    No agents yet. Create your first agent to get started.
                  </p>
                  <Link href="/agents/new">
                    <Button size="sm" className="gradient-primary text-white border-0">
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Agent
                    </Button>
                  </Link>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Agent</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id} className="border-t border-border/60 hover:bg-muted/50">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="gradient-primary flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white">
                              {account.agent?.name.charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <p className="font-medium text-foreground">{account.agent?.name}</p>
                              <p className="text-xs text-muted-foreground">{account.agent?.platform}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={account.status} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-foreground font-num">
                          ${parseFloat(account.balance).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link
                            href={`/agents/${account.agent?.id}`}
                            className="inline-flex items-center rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right column: recent activity */}
        <div className="lg:col-span-2">
          <div className="card-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
              <Link href="/transactions" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="overflow-x-auto">
              {recentTransactions.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Merchant / Description</th>
                      <th className="px-3 py-2 font-medium">Direction</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((tx) => {
                      const isInbound = tx.type === 'INBOUND'
                      return (
                        <tr key={tx.id} className="border-t border-border/60 hover:bg-muted/50">
                          <td className="max-w-[180px] px-3 py-2.5">
                            <p className="truncate font-medium text-foreground">
                              {tx.merchantName || tx.description || `${tx.type} transaction`}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {dateFormatter.format(new Date(tx.createdAt))}
                            </p>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium ${
                                isInbound ? 'text-emerald-600' : 'text-slate-600'
                              }`}
                            >
                              {isInbound ? (
                                <ArrowDownRight className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              )}
                              {isInbound ? 'Inbound' : 'Outbound'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusBadge status={tx.status} />
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right font-semibold font-num ${
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
