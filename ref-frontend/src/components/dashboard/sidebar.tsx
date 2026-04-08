'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Percent,
  FolderOpen,
  Users,
  Settings as SettingsIcon,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/dashboard/projects', icon: FolderOpen },
  { label: 'Usage', href: '/dashboard/usage', icon: Percent },
  { label: 'Subscriptions', href: '/dashboard/subscriptions', icon: Users },
]

const bottomNavItems = [
  { label: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
  { label: 'Help & Support', href: '/dashboard/help', icon: HelpCircle },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
          'fixed left-0 top-0 h-screen w-56 bg-sidebar border-r border-sidebar-border transition-transform duration-300 z-50 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
      >
        {/* Logo — h-14 aligned with navbar */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border shrink-0">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-primary-foreground" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="font-bold text-sm text-sidebar-foreground tracking-tight whitespace-nowrap">Contentlytics</h1>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                title={item.label}
                className={cn(
                  'relative flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium text-xs transition-all duration-150',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                )}
                <Icon size={16} className="shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom Section */}
        <div className="px-2 py-3 border-t border-sidebar-border space-y-0.5 shrink-0">
          {bottomNavItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                title={item.label}
                className={cn(
                  'relative flex items-center gap-2.5 px-3 py-2 rounded-lg font-medium text-xs transition-all duration-150',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                )}
                <Icon size={16} className="shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            )
          })}

          {/* Upgrade card — matches dash-ref */}
          <div className="mt-3 p-3 bg-primary rounded-xl text-center">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-bold text-xs mb-1 text-white">Upgrade to Premium!</h3>
            <p className="text-[10px] text-white/80 mb-2.5 leading-tight">
              Upgrade your account and unlock all the benefits.
            </p>
            <Link
              href="/dashboard/subscriptions"
              onClick={onClose}
              className="block w-full px-3 py-1.5 bg-white text-primary font-semibold text-xs rounded-lg cursor-pointer hover:opacity-90 active:scale-95 transition-all duration-150"
            >
              Upgrade premium
            </Link>
          </div>
        </div>
      </aside>
    </>
  )
}
