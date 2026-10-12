'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Bell, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shared authenticated navigation shell (desktop wireframe style):
 * brand icon + wordmark left, centered nav links with a slim active
 * underline, notification/avatar right. Presentation only — all links
 * point at existing routes and the sign-out flow stays functional via
 * the existing /api/logout endpoint.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/agents', label: 'Agents' },
  { href: '/external-accounts', label: 'External Accounts' },
] as const

export function MainNav({ ownerName, pendingCount }: { ownerName: string; pendingCount?: number }) {
  const pathname = usePathname()

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
    } catch (error) {
      console.error('Logout error:', error)
    }
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
    window.location.href = '/'
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/agents') return pathname.startsWith('/agents')
    return pathname.startsWith(href)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/moltmoney-icon.png"
            alt="MoltMoney"
            width={28}
            height={28}
            className="h-7 w-7"
            priority
          />
          <span className="text-lg font-bold tracking-tight text-foreground">MoltMoney</span>
        </Link>

        {/* Center nav (desktop) */}
        <nav className="hidden md:flex items-center gap-6 h-full" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'relative flex h-full items-center border-b-2 px-1 py-4 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'border-transparent text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
              {item.href === '/approvals' && pendingCount !== undefined && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
              {isActive(item.href) && (
                <span
                  aria-hidden
                  className="gradient-primary absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                />
              )}
            </Link>
          ))}
        </nav>

        {/* Right side: notifications, avatar, logout */}
        <div className="flex items-center gap-3">
          {pendingCount !== undefined && pendingCount > 0 && (
            <Link
              href="/approvals"
              className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={`${pendingCount} pending approvals`}
            >
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white">
                {pendingCount}
              </span>
            </Link>
          )}
          <div className="hidden sm:flex items-center gap-2">
            <span
              aria-hidden
              className="gradient-primary flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
            >
              {(ownerName || '?').charAt(0).toUpperCase()}
            </span>
            <span className="text-sm font-medium text-foreground">{ownerName}</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  )
}
