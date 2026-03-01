'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Navbar } from '@/components/dashboard/navbar'
import { Sidebar } from '@/components/dashboard/sidebar'
import { ThemeProvider } from '@/components/common/theme-provider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  
  // Session pages and job progress pages get full-screen experiences (no dashboard chrome)
  const isSessionPage = pathname?.includes('/sessions/')
  const isJobProgressPage = pathname?.includes('/jobs/') && pathname?.includes('/progress')

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
      <div className="min-h-screen bg-[#0A0A0A] text-foreground flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        {/* Main content area */}
        <main className="flex-1 transition-all duration-300 md:ml-67.5 p-2 md:p-4 h-screen overflow-hidden">
          <div className="bg-[#0E0E0E] rounded-md border border-border/50 shadow-sm h-full flex flex-col overflow-hidden relative">
            <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
            <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
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
