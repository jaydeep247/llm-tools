'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Navbar } from '@/components/dashboard/navbar'
import { Sidebar } from '@/components/dashboard/sidebar'
import { useAuth } from '@/hooks/useAuth'
import { getOnboardingResumePath, requiresOnboarding } from '@/lib/onboarding'
import { useUpdateUserMutation } from '@/store/api/userApi'

function toLabel(segment: string) {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function PageBreadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  const crumbs = segments.map((seg, i) => ({
    label: toLabel(seg),
    href: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }))

  return (
    <nav className="flex items-center gap-1.5 text-sm mb-5">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          {crumb.isLast ? (
            <span className="text-foreground font-semibold">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading: isAuthLoading } = useAuth()
  const [updateUser] = useUpdateUserMutation()
  const didAutoCompleteOnboarding = useRef(false)

  const isProjectFlowPage = pathname?.startsWith('/dashboard/projects/')
  const isSessionPage = pathname?.includes('/sessions/')
  const isJobProgressPage = pathname?.includes('/jobs/') && pathname?.includes('/progress')
  const shouldBypassOnboardingRedirect = isProjectFlowPage || isSessionPage || isJobProgressPage
  const shouldRedirectToOnboarding = !!user && requiresOnboarding(user) && !shouldBypassOnboardingRedirect

  useEffect(() => {
    if (!user || !shouldBypassOnboardingRedirect || !requiresOnboarding(user)) return
    if (didAutoCompleteOnboarding.current) return
    didAutoCompleteOnboarding.current = true
    updateUser({
      id: user.id,
      data: {
        onboardingState: {
          status: 'completed',
          currentFlow: 'core',
          currentStep: 0,
          resumePath: '/dashboard',
        },
      },
    }).unwrap().catch(() => {})
  }, [user, shouldBypassOnboardingRedirect, updateUser])

  useEffect(() => {
    if (isAuthLoading) return
    if (!user) {
      window.location.replace('/signin')
    } else if (shouldRedirectToOnboarding) {
      router.replace(getOnboardingResumePath(user))
    }
  }, [user, isAuthLoading, router, shouldRedirectToOnboarding])

  if (isAuthLoading || !user || shouldRedirectToOnboarding) {
    return (
      <div className="light-dashboard h-screen w-full bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-border border-t-primary animate-spin" />
      </div>
    )
  }

  if (isSessionPage || isJobProgressPage) {
    return <>{children}</>
  }

  return (
    <div className="light-dashboard min-h-screen bg-background text-foreground flex">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area — offset matches sidebar w-56 */}
      <main className="flex-1 md:ml-56 h-screen overflow-hidden flex flex-col transition-all duration-300">
        <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <PageBreadcrumb />
          {children}
        </div>
      </main>
    </div>
  )
}

