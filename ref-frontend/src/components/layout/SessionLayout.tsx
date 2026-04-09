'use client'

import { ReactNode, useState } from 'react'
import { SessionNavbar } from '@/components/user-journey/NewSessionNavbar'
import { SessionSidebar } from '@/components/user-journey/NewSessionSidebar'
import { ThemeProvider } from '@/components/common/theme-provider'
import { cn } from '@/lib/utils'

interface SessionLayoutProps {
  children: ReactNode
  projectId: string
  projectName: string
  sessionId: string
  sessionUrl?: string
  activeSection?: string
  onSectionChange?: (section: string) => void
  alertCount?: number
}

export function SessionLayout({
  children,
  projectId,
  projectName,
  sessionId,
  sessionUrl,
  activeSection,
  onSectionChange,
  alertCount = 0,
}: SessionLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <div className="min-h-screen bg-[#09090B] text-foreground flex">
        <SessionSidebar
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          alertCount={alertCount}
        />

        {/* Main content area */}
        <main
          className={cn(
            'flex-1 transition-all duration-300 ease-in-out p-1.5 md:p-3 h-screen overflow-hidden',
            collapsed ? 'md:ml-14' : 'md:ml-68'
          )}
        >
          <div className="bg-[#0F0F11] rounded-2xl border border-zinc-800 h-full flex flex-col overflow-hidden relative">
            <SessionNavbar
              projectId={projectId}
              projectName={projectName}
              sessionId={sessionId}
              sessionUrl={sessionUrl}
              activeSection={activeSection}
              onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
            />
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
