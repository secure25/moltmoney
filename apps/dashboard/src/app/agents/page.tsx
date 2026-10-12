'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus, Users, Loader2 } from 'lucide-react'
import { PageHeader, StatusBadge } from '@/components/page-header'

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

/**
 * Agents listing page. Presentation-only composition over the existing
 * GET /accounts endpoint (same source the dashboard uses) — agents only
 * exist as banking accounts in this app, so the list mirrors that data.
 */
export default function AgentsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const token = document.cookie
          .split('; ')
          .find((row) => row.startsWith('token='))
          ?.split('=')[1]

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (response.ok) {
          setAccounts(await response.json())
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const activeCount = accounts.filter((a) => a.status === 'ACTIVE').length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agents"
        subtitle={
          accounts.length > 0
            ? `${activeCount} active of ${accounts.length} agent${accounts.length === 1 ? '' : 's'}`
            : 'Manage the AI agents connected to your banking'
        }
        actions={
          <Link href="/agents/new">
            <Button size="sm" className="gradient-primary text-white border-0 hover:opacity-90 transition-opacity">
              <Plus className="h-4 w-4 mr-2" />
              Create Agent
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="card-surface px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Could not load agents</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Make sure the API is running, then refresh the page.
          </p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="card-surface flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(222,40%,96%)] text-muted-foreground">
            <Users className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-foreground">No agents yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first agent to give it its own banking account.
          </p>
          <Link href="/agents/new">
            <Button size="sm" className="mt-4 gradient-primary text-white border-0">
              <Plus className="h-4 w-4 mr-2" />
              Create Agent
            </Button>
          </Link>
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                  <th className="px-4 py-2.5 font-medium">Platform</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="gradient-primary flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white">
                          {account.agent?.name.charAt(0).toUpperCase() ?? '?'}
                        </span>
                        <span className="font-medium text-foreground">{account.agent?.name ?? 'Unknown agent'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{account.agent?.platform ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={account.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground font-num">
                      ${parseFloat(account.balance).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
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
          </div>
        </div>
      )}
    </div>
  )
}
