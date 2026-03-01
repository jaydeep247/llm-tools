'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Percent,
  FolderOpen,
  Users,
  Settings as SettingsIcon,
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
          'fixed left-0 top-0 h-screen w-68 bg-[#09090B] transition-transform duration-300 z-50 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="px-5 flex items-center h-18">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center">
              <div className="w-5 h-5 relative">
                <Image
                  src="/images/attrock_logo.png"
                  alt="Attrock"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">Clarian</span>
          </div>
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
      </aside>
    </>
  )
}
