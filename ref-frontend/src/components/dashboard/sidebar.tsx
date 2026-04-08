'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Percent,
  FolderOpen,
  Users,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useLogoutMutation } from '@/store/api/authApi'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/dashboard/projects', icon: FolderOpen },
  { label: 'Usage', href: '/dashboard/usage', icon: Percent },
  { label: 'Subscriptions', href: '/dashboard/subscriptions', icon: Users },
]

const bottomNavItems = [
  { label: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const [logout] = useLogoutMutation()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLogout = async () => {
    try {
      await logout().unwrap()
    } catch {
      // resetApiState is dispatched in onQueryStarted regardless
    }
    onClose?.()
    router.push('/')
  }

  if (!mounted) return null

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm md:hidden z-40 cursor-pointer"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-68 bg-[#09090B] transition-transform duration-300 z-50 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="px-5 flex items-center h-18">
          <span className="text-xl font-bold tracking-tight text-white">Contentlytics</span>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-zinc-800" />

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 rounded-sm text-[13px] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-indigo-500/10 text-indigo-200'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/40'
                )}
              >
                <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-indigo-400' : 'text-zinc-600')} />
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-zinc-800" />

        {/* Bottom navigation */}
        <div className="px-3 py-3">
          {bottomNavItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 rounded-sm text-[13px] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-indigo-500/10 text-indigo-200'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/40'
                )}
              >
                <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-indigo-400' : 'text-zinc-600')} />
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-zinc-800" />

        {/* User info + Logout */}
        <div className="px-4 py-4 flex items-center gap-3">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>

          {/* Name + email */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white truncate">{user?.name || 'User'}</p>
            <p className="text-[11px] text-zinc-500 truncate">{user?.email}</p>
          </div>

          {/* Logout icon button */}
          <button
            onClick={handleLogout}
            title="Logout"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  )
}
