import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { MainNav } from '@/components/main-nav'

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
    <div className="min-h-screen bg-[hsl(222,40%,98%)]">
      <MainNav ownerName={owner.name as string} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
