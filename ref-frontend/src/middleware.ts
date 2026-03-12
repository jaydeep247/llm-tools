import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_COOKIE = 'access_token'
const ADMIN_COOKIE = 'admin_token'

/**
 * Decode a JWT payload without verifying the signature.
 * Edge-runtime safe (no Node crypto required). Full cryptographic
 * verification is enforced server-side on every API call.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // atob is available in Edge/browser; add padding just in case
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(
      parts[1].length + ((4 - (parts[1].length % 4)) % 4),
      '=',
    )
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAdminLogin = pathname === '/admin/login'
  const isAdmin = pathname.startsWith('/admin')
  const isOnboarding = pathname === '/onboarding'
  const isDashboard = pathname.startsWith('/dashboard')

  // ── Admin route protection ──────────────────────────────────────────────
  // All /admin/* paths (except /admin/login itself) require a valid
  // admin_token cookie whose payload carries role === 'ADMIN'.
  if (isAdmin && !isAdminLogin) {
    const token = request.cookies.get(ADMIN_COOKIE)?.value

    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const payload = decodeJwtPayload(token)
    if (!payload || payload['role'] !== 'ADMIN') {
      // Cookie present but tampered or for a wrong role — clear it and redirect.
      const response = NextResponse.redirect(new URL('/admin/login', request.url))
      response.cookies.delete(ADMIN_COOKIE)
      return response
    }

    return NextResponse.next()
  }

  // ── Regular user route protection ──────────────────────────────────────
  const token = request.cookies.get(AUTH_COOKIE)?.value
  if (!token && (isOnboarding || isDashboard)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/onboarding', '/dashboard/:path*', '/admin/:path*'],
}

