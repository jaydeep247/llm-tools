'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Navbar } from '@/components/dashboard/navbar'
import { Sidebar } from '@/components/dashboard/sidebar'
import { ThemeProvider } from '@/components/common/theme-provider'
import { useAuth } from '@/hooks/useAuth'
import { getOnboardingResumePath, requiresOnboarding } from '@/lib/onboarding'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading: isAuthLoading } = useAuth()

  useEffect(() => {
    if (isAuthLoading) return
    if (!user) {
      window.location.replace('/signin')
    } else if (requiresOnboarding(user)) {
      router.replace(getOnboardingResumePath(user))
    }
  }, [user, isAuthLoading, router])

  // Session pages and job progress pages get full-screen experiences (no dashboard chrome)
  const isSessionPage = pathname?.includes('/sessions/')
  const isJobProgressPage = pathname?.includes('/jobs/') && pathname?.includes('/progress')

  // Show spinner while auth is resolving or while redirect is pending
  if (isAuthLoading || !user || requiresOnboarding(user)) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <div className="h-screen w-full bg-[#09090B] flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-white/10 border-t-white animate-spin" />
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

  // Regular dashboard layout
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <div className="min-h-screen bg-[#09090B] text-foreground flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        {/* Main content area */}
        <main className="flex-1 transition-all duration-300 md:ml-68 p-1.5 md:p-3 h-screen overflow-hidden">
          <div className="bg-[#0F0F11] rounded-2xl border border-zinc-800 h-full flex flex-col overflow-hidden relative">
            <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
            <div className="flex-1 overflow-y-auto pt-10 px-4 md:px-8 pb-8">
              <div className="mx-auto h-full">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
