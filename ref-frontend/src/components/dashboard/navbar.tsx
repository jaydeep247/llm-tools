'use client'

import { Menu, Search, Bell, Gift, Plus } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

interface NavbarProps {
  onMenuToggle?: () => void
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const pathname = usePathname()
  const { user } = useAuth()

  const userInitial = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'

  return (
    <header
      className="shrink-0 flex items-center"
      style={{
        height: 60,
        background: 'var(--nd-sidebar-bg)',
        borderBottom: '1px solid var(--nd-border)',
        padding: '0 20px 0 24px',
        gap: 12,
      }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuToggle}
        className="md:hidden flex items-center justify-center cursor-pointer"
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: 'transparent',
          border: 'none',
          color: 'var(--nd-text-secondary)',
        }}
      >
        <Menu style={{ width: 18, height: 18 }} />
      </button>

      {/* ── Search bar (left) ── */}
      <div
        className="hidden md:flex items-center"
        style={{
          width: 240,
          height: 36,
          border: '1px solid var(--nd-border)',
          borderRadius: 8,
          background: 'var(--nd-sidebar-bg)',
          padding: '0 12px',
          gap: 8,
          transition: 'border-color 150ms ease',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--nd-border-hover)' }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--nd-border)' }}
      >
        <Search
          className="shrink-0"
          style={{ width: 15, height: 15, color: 'var(--nd-text-muted)' }}
        />
        <input
          type="text"
          placeholder="Search..."
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: 'var(--font-base)',
            color: 'var(--nd-text-primary)',
            background: 'transparent',
            fontFamily: 'inherit',
            lineHeight: 1,
          }}
        />
        <span
          style={{
            fontSize: 'var(--font-xs)',
            color: 'var(--nd-text-muted)',
            whiteSpace: 'nowrap',
            opacity: 0.8,
          }}
        >
          ⌘ + F
        </span>
      </div>

      {/* ── Right section ── */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Gift icon */}
        <button
          className="flex items-center justify-center cursor-pointer"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--nd-text-secondary)',
            transition: 'background 150ms ease, color 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--nd-nav-hover-bg)'
            e.currentTarget.style.color = 'var(--nd-text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--nd-text-secondary)'
          }}
        >
          <Gift style={{ width: 18, height: 18 }} />
        </button>

        {/* Bell icon */}
        <button
          className="flex items-center justify-center cursor-pointer relative"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--nd-text-secondary)',
            transition: 'background 150ms ease, color 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--nd-nav-hover-bg)'
            e.currentTarget.style.color = 'var(--nd-text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--nd-text-secondary)'
          }}
        >
          <Bell style={{ width: 18, height: 18 }} />
        </button>

        {/* Plus icon */}
        <button
          className="flex items-center justify-center cursor-pointer"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--nd-text-secondary)',
            transition: 'background 150ms ease, color 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--nd-nav-hover-bg)'
            e.currentTarget.style.color = 'var(--nd-text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--nd-text-secondary)'
          }}
        >
          <Plus style={{ width: 18, height: 18 }} />
        </button>

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 20,
            background: 'var(--nd-border)',
            margin: '0 8px',
          }}
        />

        {/* Avatar */}
        <div
          className="shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--nd-purple)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontSize: 'var(--font-sm)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          {userInitial}
        </div>

        {/* User info */}
        <div className="hidden md:flex" style={{ flexDirection: 'column', gap: 1, marginLeft: 4 }}>
          <span
            style={{
              fontSize: 'var(--font-base)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--nd-text-primary)',
              lineHeight: 'var(--lh-tight)',
            }}
          >
            {user?.name || 'Young Alaska'}
          </span>
          <span
            style={{
              fontSize: 'var(--font-xs)',
              color: 'var(--nd-text-muted)',
              lineHeight: 'var(--lh-tight)',
            }}
          >
            Business
          </span>
        </div>
      </div>
    </header>
  )
}