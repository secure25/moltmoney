import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Sparkles, LayoutDashboard, Receipt, CheckCircle } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'

async function getOwner() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value

  if (!token) {
    return null
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    return response.json()
  } catch {
    return null
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const owner = await getOwner()

  if (!owner) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-amber-50">
      {/* Premium Navigation */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-white/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center justify-between">
            <div className="flex items-center gap-12">
              <Link href="/dashboard" className="flex items-center space-x-2 group">
                <div className="w-10 h-10 rounded-xl gradient-premium flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <span className="text-2xl font-bold text-gradient">MoltMoney</span>
              </Link>
              
              <div className="hidden md:flex items-center gap-1">
                <Link 
                  href="/dashboard" 
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-white/50 hover:text-purple-600 transition-all"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </Link>
                <Link 
                  href="/transactions" 
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-white/50 hover:text-purple-600 transition-all"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Transactions</span>
                </Link>
                <Link 
                  href="/approvals" 
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-white/50 hover:text-purple-600 transition-all"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Approvals</span>
                </Link>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center space-x-3 px-4 py-2 rounded-lg glass border border-purple-200/50">
                <div className="w-8 h-8 rounded-full gradient-premium flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">
                    {(owner.name as string).charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-900">{owner.name as string}</span>
              </div>
              
              <LogoutButton />
            </div>
          </div>
        </div>
      </nav>
      
      {/* Main Content */}
      <main className="pt-28 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  )
}
