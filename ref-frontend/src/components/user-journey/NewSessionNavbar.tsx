'use client'

import { ChevronRight, Menu, Search, Bell, Gift, Plus } from 'lucide-react'
import Link from 'next/link'
import { sessionSections } from './NewSessionSidebar'
import { DateRangeToggle } from '@/components/date-range/DateRangeToggle'
import { useAuth } from '@/hooks/useAuth'

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
    if (!group.children || group.children.length === 0) {
      map[group.id] = { parent: group.label, label: group.label }
      continue
    }
    for (const child of group.children) {
      map[child.id] = { parent: group.label, label: child.label }
    }
  }
  return map
})()

export function SessionNavbar({ projectId, projectName, sessionId, sessionUrl, activeSection, onMenuToggle }: SessionNavbarProps) {
  const current = activeSection ? sectionLabels[activeSection] : undefined
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

      {/* ── Breadcrumb ── */}
      <nav className="flex items-center" style={{ gap: 6, fontSize: 'var(--font-base)' }}>
        <Link
          href="/dashboard/projects"
          className="no-underline"
          style={{ color: 'var(--nd-text-muted)', transition: 'color 150ms ease' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--nd-text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--nd-text-muted)' }}
        >
          Projects
        </Link>

        <ChevronRight style={{ width: 12, height: 12, color: 'var(--nd-text-muted)' }} />

        <Link
          href={`/dashboard/projects/${projectId}`}
          className="no-underline"
          style={{
            color: 'var(--nd-text-muted)',
            transition: 'color 150ms ease',
            maxWidth: 150,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--nd-text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--nd-text-muted)' }}
        >
          {projectName}
        </Link>

        <ChevronRight style={{ width: 12, height: 12, color: 'var(--nd-text-muted)' }} />

        <span
          style={{
            color: 'var(--nd-text-secondary)',
            maxWidth: 150,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={sessionUrl}
        >
          {sessionUrl && sessionUrl.length > 0 ? new URL(sessionUrl).hostname : 'Session'}
        </span>

        {current && (
          <>
            <ChevronRight style={{ width: 12, height: 12, color: 'var(--nd-text-muted)' }} />
            <span style={{ color: 'var(--nd-text-primary)', fontWeight: 'var(--font-weight-medium)' }}>
              {current.label}
            </span>
          </>
        )}
      </nav>

      {/* ── Right section ── */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <div className="hidden lg:block">
          <DateRangeToggle />
        </div>

        {/* Search bar */}
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
            ⌘K
          </span>
        </div>

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
            {user?.name || 'User'}
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
