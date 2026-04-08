'use client'

import { useState } from 'react'
import { Menu, Search, Bell, Settings, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useLogoutMutation } from '@/store/api/authApi'
import Link from 'next/link'

interface NavbarProps {
  onMenuToggle?: () => void
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [logout] = useLogoutMutation()
  const [profileOpen, setProfileOpen] = useState(false)

  const userInitial = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'
  const displayName = user?.name || user?.email?.split('@')[0] || 'User'

  const handleLogout = async () => {
    setProfileOpen(false)
    try {
      await logout().unwrap()
    } catch {
      // resetApiState is dispatched in onQueryStarted regardless
    }
    router.push('/')
  }

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 gap-4 shrink-0">
      {/* Left — mobile hamburger + search */}
      <div className="flex items-center gap-3 flex-1 max-w-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuToggle}
          className="md:hidden h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-secondary"
        >
          <Menu size={16} />
        </Button>

        {/* Search bar — matches dash-ref */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full pl-8 pr-12 py-1.5 text-xs bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground cursor-text transition-all duration-150"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-border px-1 py-0.5 rounded font-mono pointer-events-none">
            ⌘K
          </span>
        </div>
      </div>

      {/* Right — bell + separator + avatar dropdown */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Notification bell */}
        <button className="relative p-1.5 rounded-lg cursor-pointer hover:bg-secondary hover:text-foreground transition-all duration-150 text-muted-foreground">
          <Bell size={16} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary ring-2 ring-card" />
        </button>

        <div className="w-px h-5 bg-border" />

        {/* Avatar + profile dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="w-8 h-8 rounded-full overflow-hidden cursor-pointer ring-2 ring-border hover:ring-primary/50 hover:scale-105 transition-all duration-150 shrink-0 bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center"
          >
            <span className="text-xs font-semibold text-white">{userInitial}</span>
          </button>

          {profileOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setProfileOpen(false)}
              />
              {/* Dropdown — explicit hex so it works outside .light-dashboard scope */}
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#E2E8F0] rounded-xl shadow-lg z-50 overflow-hidden">
                {/* User info header */}
                <div className="px-4 py-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-white">{userInitial}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A] truncate">{displayName}</p>
                      <p className="text-[11px] text-[#94A3B8] truncate">{user?.email}</p>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button
                    onClick={() => { setProfileOpen(false); router.push('/dashboard') }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#0F172A] hover:bg-[#F1F5F9] transition-colors duration-150 cursor-pointer"
                  >
                    <User size={15} className="text-[#94A3B8] shrink-0" />
                    Profile
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); router.push('/dashboard/settings') }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#0F172A] hover:bg-[#F1F5F9] transition-colors duration-150 cursor-pointer"
                  >
                    <Settings size={15} className="text-[#94A3B8] shrink-0" />
                    Settings
                  </button>
                </div>

                <div className="h-px bg-[#E2E8F0]" />

                <div className="py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors duration-150 cursor-pointer"
                  >
                    <LogOut size={15} className="shrink-0" />
                    Log out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
