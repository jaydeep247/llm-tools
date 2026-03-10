'use client'

import { ChevronRight, Menu, Search, Bell, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { sessionSections } from './NewSessionSidebar'

interface SessionNavbarProps {
  projectId: string
  projectName: string
  sessionId: string
  sessionUrl?: string
  activeSection?: string
  onMenuToggle?: () => void
}

const sectionLabels: Record<string, { parent: string; label: string }> = (() => {
  const map: Record<string, { parent: string; label: string }> = {}
  for (const group of sessionSections) {
    // Handle sections without children (like Dashboard)
    if (!group.children || group.children.length === 0) {
      map[group.id] = { parent: group.label, label: group.label }
      continue
    }
    // Handle sections with children
    for (const child of group.children) {
      map[child.id] = { parent: group.label, label: child.label }
    }
  }
  return map
})()

export function SessionNavbar({ projectId, projectName, sessionId, sessionUrl, activeSection, onMenuToggle }: SessionNavbarProps) {
  const current = activeSection ? sectionLabels[activeSection] : undefined

  return (
    <header className="flex h-15 shrink-0 items-center justify-between px-6 py-3 border-b border-white/4">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuToggle}
          className="md:hidden h-8 w-8"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <Link
            href="/dashboard/projects"
            className="text-zinc-500 hover:text-zinc-300 transition-colors duration-200"
          >
            Projects
          </Link>

          <ChevronRight className="h-3 w-3 text-zinc-600" />

          <Link
            href={`/dashboard/projects/${projectId}`}
            className="text-zinc-500 hover:text-zinc-300 transition-colors duration-200 truncate max-w-25 sm:max-w-37.5 md:max-w-none"
          >
            {projectName}
          </Link>

          <ChevronRight className="h-3 w-3 text-zinc-600" />

          <span className="text-zinc-500 truncate max-w-25 sm:max-w-37.5 md:max-w-none" title={sessionUrl}>
            {sessionUrl && sessionUrl.length > 0 ? new URL(sessionUrl).hostname : 'Session'}
          </span>

          {current && (
            <>
              <ChevronRight className="h-3 w-3 text-zinc-600" />
              <span className="text-white font-medium">{current.label}</span>
            </>
          )}
        </nav>
      </div>

      {/* Right side — Search, Notifications, Avatar */}
      <div className="flex items-center gap-2">
        {/* Search bar */}
        <div className="hidden md:flex items-center gap-2 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-1.5 w-55 focus-within:border-zinc-600 focus-within:bg-zinc-800/80 transition-all duration-200">
          <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 outline-none w-full"
          />
            <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] text-zinc-500 font-mono">
            ⌘K
          </kbd>
        </div>

        {/* Notification bell */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 relative"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-[#0F0F12]" />
        </Button>

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl text-zinc-500 hover:text-indigo-400 hover:bg-zinc-800/60"
        >
          <Settings className="h-4 w-4" />
        </Button>

        {/* User avatar */}
        <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold ml-1 cursor-pointer hover:ring-2 hover:ring-indigo-500/50 transition-all">
          U
        </div>
      </div>
    </header>
  )
}
