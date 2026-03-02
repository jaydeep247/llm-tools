import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_COOKIE = 'access_token'

export function middleware(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value
  const { pathname } = request.nextUrl

  const isOnboarding = pathname === '/onboarding'
  const isDashboard = pathname.startsWith('/dashboard')

  // No token → kick to home for any protected route
  if (!token && (isOnboarding || isDashboard)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/onboarding', '/dashboard/:path*'],
}
