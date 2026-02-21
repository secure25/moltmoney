import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  const { pathname } = request.nextUrl

  // Allow landing page
  if (pathname === '/') {
    return NextResponse.next()
  }

  // Public routes (auth pages)
  if (pathname.startsWith('/auth')) {
    // Allow access to auth pages even with a token
    // The dashboard layout will validate the token properly
    return NextResponse.next()
  }

  // Protected routes (everything else)
  if (!token) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
