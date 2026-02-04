'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  FolderOpen,
  CreditCard,
  Zap,
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Moon,
  Sun,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Projects',
    href: '/dashboard/projects',
    icon: FolderOpen,
  },
  {
    label: 'Subscriptions',
    href: '/dashboard/subscriptions',
    icon: CreditCard,
  },
  {
    label: 'Usage',
    href: '/dashboard/usage',
    icon: Zap,
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm md:hidden z-20 cursor-pointer"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 transition-all duration-300 z-30 overflow-y-auto md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="bg-white/10 backdrop-blur-2xl border-r border-white/20 h-full flex flex-col">
          {/* Logo Section */}
          <div className="flex items-center justify-between px-4 sm:px-5 md:px-6 h-12 sm:h-14 md:h-16 border-b border-white/20 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white rounded-lg flex items-center justify-center">
                <LayoutDashboard className="h-4 w-4 sm:h-5 sm:w-5 text-slate-900" />
              </div>
              <h1 className="text-base sm:text-lg font-bold text-white">AEO Checker</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="md:hidden text-white hover:bg-white/20 rounded-lg transition-all duration-300 h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 px-3 sm:px-4 py-4 sm:py-5 md:py-6 space-y-4 sm:space-y-5 md:space-y-6 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              // For Dashboard, only match exact path. For others, match path and sub-routes
              const isActive = item.href === '/dashboard' 
                ? pathname === '/dashboard'
                : pathname === item.href || pathname.startsWith(item.href + '/')

              return (
                <Link key={item.href} href={item.href} onClick={onClose}>
                  <div
                    className={cn(
                      'group relative w-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg md:rounded-xl transition-all duration-300 cursor-pointer',
                      isActive
                        ? 'bg-white/75 backdrop-blur-md shadow-lg'
                        : 'hover:bg-white/5'
                    )}
                  >
                    <Icon 
                      className={cn(
                        'h-4 w-4 sm:h-5 sm:w-5 shrink-0 transition-colors',
                        isActive ? 'text-slate-900' : 'text-white/70 group-hover:text-white/90'
                      )} 
                    />
                    <span 
                      className={cn(
                        'text-xs sm:text-sm font-medium transition-colors',
                        isActive ? 'text-slate-900 font-semibold' : 'text-white/70 group-hover:text-white/90'
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                </Link>
              )
            })}
          </nav>

          {/* Bottom Options */}
          <div className="border-t border-white/20 px-3 sm:px-4 py-3 sm:py-4 shrink-0 space-y-1.5 sm:space-y-2">
            {/* Contact */}
            <button className="w-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg md:rounded-xl text-white/70 hover:bg-white/5 hover:text-white/90 transition-all duration-300 cursor-pointer">
              <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">Contact</span>
            </button>
            
            {/* Dark Theme Toggle */}
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg md:rounded-xl text-white/70 hover:bg-white/5 hover:text-white/90 transition-all duration-300 cursor-pointer"
            >
              {!mounted ? (
                <Moon className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              ) : theme === 'dark' ? (
                <Moon className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              ) : (
                <Sun className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              )}
              <span className="text-xs sm:text-sm font-medium">Dark Theme</span>
            </button>
            
            {/* Account */}
            <button className="w-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg md:rounded-xl text-white/70 hover:bg-white/5 hover:text-white/90 transition-all duration-300 cursor-pointer">
              <User className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">Account</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
