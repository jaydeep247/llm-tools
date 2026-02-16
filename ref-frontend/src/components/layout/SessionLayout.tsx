'use client'

import { ReactNode, useState } from 'react'
import { SessionNavbar } from '@/components/layout/SessionNavbar'
import { SessionSidebar } from '@/components/layout/SessionSidebar'

interface SessionLayoutProps {
  children: ReactNode
  projectId: string
  projectName: string
  sessionId: string
  activeSection?: string
  onSectionChange?: (section: string) => void
}

export function SessionLayout({ 
  children, 
  projectId, 
  projectName, 
  sessionId,
  activeSection,
  onSectionChange 
}: SessionLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex flex-col h-screen bg-black">
      <SessionNavbar 
        projectId={projectId}
        projectName={projectName}
        sessionId={sessionId}
        activeSection={activeSection}
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      
      <div className="flex flex-1 overflow-hidden pt-12 sm:pt-14 md:pt-16">
        <SessionSidebar 
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        
        <main className="flex-1 overflow-y-auto md:ml-64">
          {children}
        </main>
      </div>
    </div>
  )
}
