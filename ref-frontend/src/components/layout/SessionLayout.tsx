'use client'

import { ReactNode, useState } from 'react'
import { SessionNavbar } from '@/components/user-journey/NewSessionNavbar'
import { SessionSidebar } from '@/components/user-journey/NewSessionSidebar'
import { ThemeProvider } from '@/components/common/theme-provider'

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
      <div
        className="nexus-dashboard min-h-screen"
        style={{ background: 'var(--nd-bg)' }}
      >
        <SessionSidebar
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          alertCount={alertCount}
        />

        {/* Main content area — margin equals sidebar width */}
        <main
          className="flex flex-col min-h-screen transition-[margin-left] duration-300"
          style={{
            marginLeft: collapsed
              ? 'var(--sidebar-collapsed-width)'
              : 'var(--sidebar-width)',
          }}
        >
          <SessionNavbar
            projectId={projectId}
            projectName={projectName}
            sessionId={sessionId}
            sessionUrl={sessionUrl}
            activeSection={activeSection}
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          />
          <div className="flex-1 overflow-y-auto px-4 md:px-6">
            <div className="mx-auto max-w-360">
              {children}
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
