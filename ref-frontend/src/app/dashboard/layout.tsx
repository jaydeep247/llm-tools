'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Navbar } from '@/components/dashboard/navbar'
import { Sidebar } from '@/components/dashboard/sidebar'
import { ThemeProvider } from '@/components/common/theme-provider'
import { useAuth } from '@/hooks/useAuth'
import { getOnboardingResumePath, requiresOnboarding } from '@/lib/onboarding'
import { useUpdateUserMutation } from '@/store/api/userApi'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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

  // Show spinner while auth is resolving or while redirect is pending
  if (isAuthLoading || !user || shouldRedirectToOnboarding) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <div className="nexus-dashboard h-screen w-full flex items-center justify-center" style={{ background: 'var(--nd-bg)' }}>
          <div className="w-5 h-5 rounded-full border-2 border-[#E8E9EF] border-t-[#5347CE] animate-spin" />
        </div>
      </ThemeProvider>
    )
  }

  if (isSessionPage || isJobProgressPage) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        {children}
      </ThemeProvider>
    )
  }

  // Regular dashboard layout — Nexus light theme
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <div
        className="nexus-dashboard min-h-screen"
        style={{
          background: 'var(--nd-bg)',
        }}
      >
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        />

        {/* Main content area — margin equals sidebar width */}
        <main
          className="flex flex-col min-h-screen transition-[margin-left] duration-300"
          style={{
            marginLeft: sidebarCollapsed
              ? 'var(--sidebar-collapsed-width)'
              : 'var(--sidebar-width)',
          }}
        >
          <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
