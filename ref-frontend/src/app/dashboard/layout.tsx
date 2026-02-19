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
  
  // Check if we're on a session page
  const isSessionPage = pathname?.includes('/sessions/')

  // If on session page, render without dashboard chrome
  if (isSessionPage) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        {children}
      </ThemeProvider>
    )
  }

  // Regular dashboard layout
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <div className="min-h-screen bg-background text-foreground">
        <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        {/* Main content area - responsive with sidebar */}
        <main className="pt-14 md:pt-16 md:ml-64 transition-all duration-100">
          <div className="min-h-screen py-4 sm:py-6 md:py-8 lg:py-10 px-3 sm:px-4 md:px-6 lg:px-8">
            <div className="max-w-400 mx-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
