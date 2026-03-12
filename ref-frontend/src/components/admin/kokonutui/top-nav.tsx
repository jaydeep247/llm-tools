'use client'

import { ChevronRight, Menu, Search, Bell, Settings, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { adminSections } from './sidebar'
import { useState } from 'react'

interface AdminNavbarProps {
  onMenuToggle?: () => void
  onLogout?: () => void
}

const sectionLabels: Record<string, { parent: string; label: string }> = (() => {
  const map: Record<string, { parent: string; label: string }> = {}
  for (const group of adminSections) {
    if (!group.children || group.children.length === 0) {
      if (group.href) map[group.href] = { parent: 'Admin', label: group.label }
      continue
    }
    for (const child of group.children) {
      map[child.href] = { parent: group.label, label: child.label }
    }
  }
  return map
})()

export default function AdminNavbar({ onMenuToggle, onLogout }: AdminNavbarProps) {
  const pathname = usePathname()
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  const current = Object.entries(sectionLabels).find(
    ([href]) => pathname === href || pathname.startsWith(href + '/')
  )?.[1]

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
            href="/admin/overview"
            className="text-zinc-500 hover:text-zinc-300 transition-colors duration-200"
          >
            Admin
          </Link>

          {current && (
            <>
              <ChevronRight className="h-3 w-3 text-zinc-600" />
              <span className="text-zinc-500">{current.parent}</span>
              <ChevronRight className="h-3 w-3 text-zinc-600" />
              <span className="text-white font-medium">{current.label}</span>
            </>
          )}
        </nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search */}
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

        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu((s) => !s)}
            className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold ml-1 cursor-pointer hover:ring-2 hover:ring-indigo-500/50 transition-all"
          >
            A
          </button>

          {showProfileMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowProfileMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-44 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-zinc-800">
                  <p className="text-xs font-medium text-white">System Admin</p>
                  <p className="text-[11px] text-zinc-500 truncate">admin@llm.com</p>
                </div>
                <button
                  onClick={() => { setShowProfileMenu(false); onLogout?.() }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

