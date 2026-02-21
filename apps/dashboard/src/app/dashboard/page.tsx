import { cookies } from 'next/headers'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wallet, Users, Bell, Plus, TrendingUp, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react'

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

export default async function DashboardPage() {
  const accounts = await getAccounts()
  const recentTransactions = await getRecentTransactions()
  const pendingCount = await getPendingApprovals()

  const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome Back</h1>
          <p className="text-gray-600">Manage your AI agents and monitor their financial activity</p>
        </div>
        <div className="flex gap-3">
          {pendingCount > 0 && (
            <Link href="/approvals">
              <Button variant="outline" className="relative">
                <Bell className="w-4 h-4 mr-2" />
                Approvals
                <Badge className="ml-2 gradient-primary text-white border-0">{pendingCount}</Badge>
              </Button>
            </Link>
          )}
          <Link href="/external-accounts">
            <Button variant="outline">
              <Wallet className="w-4 h-4 mr-2" />
              External Accounts
            </Button>
          </Link>
          <Link href="/agents/new">
            <Button className="gradient-primary text-white border-0 hover:shadow-lg hover:shadow-purple-500/50 transition-all">
              <Plus className="w-4 h-4 mr-2" />
              Create Agent
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="group relative overflow-hidden rounded-2xl glass border border-purple-200/50 p-6 hover:border-purple-300 transition-all duration-300 hover:shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 gradient-primary opacity-10 rounded-full blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">Total Balance</p>
            <p className="text-3xl font-bold text-gray-900">${totalBalance.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-2">Across all agents</p>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl glass border border-purple-200/50 p-6 hover:border-purple-300 transition-all duration-300 hover:shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 gradient-gold opacity-10 rounded-full blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <Sparkles className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">Active Agents</p>
            <p className="text-3xl font-bold text-gray-900">{accounts.length}</p>
            <p className="text-xs text-gray-500 mt-2">Agent accounts</p>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl glass border border-purple-200/50 p-6 hover:border-purple-300 transition-all duration-300 hover:shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 gradient-premium opacity-10 rounded-full blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl gradient-premium flex items-center justify-center">
                <Bell className="w-6 h-6 text-white" />
              </div>
              {pendingCount > 0 && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>}
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">Pending Approvals</p>
            <p className="text-3xl font-bold text-gray-900">{pendingCount}</p>
            <p className="text-xs text-gray-500 mt-2">Require attention</p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agent Accounts */}
        <div className="rounded-2xl glass border border-purple-200/50 overflow-hidden">
          <div className="p-6 border-b border-gray-200/50">
            <h2 className="text-xl font-bold text-gray-900">Agent Accounts</h2>
            <p className="text-sm text-gray-600 mt-1">Manage your AI agent portfolios</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {accounts.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl gradient-premium opacity-20 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-purple-600" />
                  </div>
                  <p className="text-gray-600 mb-4">No agents yet. Create your first agent to get started.</p>
                  <Link href="/agents/new">
                    <Button className="gradient-primary text-white border-0">
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Agent
                    </Button>
                  </Link>
                </div>
              ) : (
                accounts.map((account) => (
                  <Link key={account.id} href={`/agents/${account.agent?.id}`}>
                    <div className="group flex items-center justify-between p-4 rounded-xl border border-gray-200/50 hover:border-purple-300 hover:bg-white/50 transition-all cursor-pointer">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-xl gradient-premium flex items-center justify-center">
                          <span className="text-white font-semibold">
                            {account.agent?.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 group-hover:text-purple-600 transition-colors">
                            {account.agent?.name}
                          </p>
                          <p className="text-sm text-gray-500">{account.agent?.platform}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">${parseFloat(account.balance).toFixed(2)}</p>
                        <Badge 
                          variant={account.status === 'ACTIVE' ? 'default' : 'secondary'}
                          className={account.status === 'ACTIVE' ? 'gradient-primary text-white border-0' : ''}
                        >
                          {account.status}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="rounded-2xl glass border border-purple-200/50 overflow-hidden">
          <div className="p-6 border-b border-gray-200/50">
            <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
            <p className="text-sm text-gray-600 mt-1">Latest transactions across all agents</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentTransactions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl gradient-gold opacity-20 flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-8 h-8 text-amber-600" />
                  </div>
                  <p className="text-gray-600">No transactions yet.</p>
                </div>
              ) : (
                recentTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200/50 hover:bg-white/50 transition-all">
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        tx.type === 'INBOUND' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {tx.type === 'INBOUND' ? (
                          <ArrowDownRight className="w-5 h-5 text-green-600" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {tx.merchantName || tx.description || `${tx.type} transaction`}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${
                        tx.type === 'INBOUND' ? 'text-green-600' : 'text-gray-900'
                      }`}>
                        {tx.type === 'INBOUND' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                      </p>
                      <Badge 
                        variant={tx.status === 'COMPLETED' ? 'default' : 'secondary'}
                        className={tx.status === 'COMPLETED' ? 'gradient-primary text-white border-0 text-xs' : 'text-xs'}
                      >
                        {tx.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
