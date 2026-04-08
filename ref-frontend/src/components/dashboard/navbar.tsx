'use client'

import { Menu, Search, Bell, Settings, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'

interface NavbarProps {
  onMenuToggle?: () => void
}

function toLabel(segment: string) {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const pathname = usePathname()
  const { user } = useAuth()

  const segments = pathname.split('/').filter(Boolean)

  // Build breadcrumb items: each gets a label and cumulative href
  const crumbs = segments.map((seg, i) => ({
    label: toLabel(seg),
    href: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }))

  const userInitial = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'

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
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-600 shrink-0" />}
              {crumb.isLast ? (
                <span className="text-white font-medium">{crumb.label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors duration-200"
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </div>

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
          {userInitial}
        </div>
      </div>
    </header>
  )
}