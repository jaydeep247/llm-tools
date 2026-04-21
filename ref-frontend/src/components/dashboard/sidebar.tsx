'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  FolderOpen,
  Percent,
  Zap,
  Download,
  Settings as SettingsIcon,
  LogOut,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useLogoutMutation } from '@/store/api/authApi'

const navGroups = [
  {
    label: 'GENERAL',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Projects', href: '/dashboard/projects', icon: FolderOpen },
    ],
  },
  {
    label: 'TOOLS',
    items: [
      { label: 'Usage', href: '/dashboard/usage', icon: Percent },
      { label: 'Subscriptions', href: '/dashboard/subscriptions', icon: Zap },
      { label: 'Export & API', href: '/dashboard/export-api', icon: Download },
    ],
  },
  {
    label: 'SUPPORT',
    items: [
      { label: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
    ],
  },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({ isOpen = true, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
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

  const userInitial = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm md:hidden z-40 cursor-pointer"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen flex flex-col z-50 transition-[width,transform] duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
        style={{
          width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
          minHeight: '100vh',
          background: 'var(--nd-sidebar-bg)',
          borderRight: '1px solid var(--nd-border)',
          padding: 0,
        }}
      >
        {/* ── Logo area ── */}
        <div
          className="flex items-center shrink-0"
          style={{
            height: 60,
            padding: collapsed ? '0' : '0 16px 0 20px',
            borderBottom: '1px solid var(--nd-border)',
            justifyContent: 'center',
          }}
        >
          {collapsed ? (
            /* Collapsed: just the expand button */
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex items-center justify-center cursor-pointer"
              style={{
                width: 36,
                height: 36,
                border: '1px solid var(--nd-border)',
                borderRadius: 8,
                background: 'transparent',
                color: 'var(--nd-text-muted)',
                transition: 'background 150ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--nd-nav-hover-bg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              title="Expand sidebar"
            >
              <PanelLeftOpen size={18} strokeWidth={1.75} />
            </button>
          ) : (
            /* Expanded: full logo + collapse btn */
            <div className="flex items-center justify-between w-full">
              <Link href="/dashboard" className="flex items-center gap-2 no-underline">
                <div
                  className="shrink-0 flex items-center justify-center text-white font-bold"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: '#5347CE',
                    fontSize: 13,
                  }}
                >
                  C
                </div>
                <span
                  style={{
                    fontSize: 'var(--font-md)',
                    fontWeight: 700,
                    color: 'var(--nd-text-primary)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Contentlytics
                </span>
              </Link>
              <button
                onClick={onToggleCollapse}
                className="hidden md:flex items-center justify-center cursor-pointer"
                style={{
                  width: 28,
                  height: 28,
                  border: '1px solid var(--nd-border)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--nd-text-muted)',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--nd-nav-hover-bg)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── Navigation groups ── */}
        <div
          className="nd-sidebar-scroll flex-1 overflow-y-auto"
          style={{ padding: collapsed ? '12px 8px 8px' : '20px 12px 8px' }}
        >
          {navGroups.map((group, groupIdx) => (
            <div key={group.label}>
              {/* Section label */}
              {!collapsed && (
                <p
                  style={{
                    fontSize: 'var(--font-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase' as const,
                    color: 'var(--nd-text-muted)',
                    padding: '0 8px',
                    marginBottom: 4,
                    marginTop: groupIdx === 0 ? 0 : 20,
                    lineHeight: 'var(--lh-normal)',
                  }}
                >
                  {group.label}
                </p>
              )}
              {collapsed && groupIdx > 0 && (
                <div
                  style={{
                    height: 1,
                    background: 'var(--nd-border)',
                    margin: '8px 4px',
                  }}
                />
              )}

              {/* Nav items */}
              <div>
                {group.items.map((item) => {
                  const isActive = pathname === item.href
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className="nd-nav-item no-underline"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: 36,
                        width: collapsed ? 40 : undefined,
                        padding: collapsed ? '0' : '0 10px',
                        borderRadius: 8,
                        gap: collapsed ? 0 : 10,
                        cursor: 'pointer',
                        marginBottom: 2,
                        marginLeft: collapsed ? 'auto' : undefined,
                        marginRight: collapsed ? 'auto' : undefined,
                        transition: 'background 150ms ease, color 150ms ease',
                        background: isActive ? 'var(--nd-nav-active-bg)' : 'transparent',
                        color: isActive ? 'var(--nd-nav-active-text)' : 'var(--nd-nav-inactive)',
                        fontSize: 'var(--font-base)',
                        fontWeight: isActive ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'var(--nd-nav-hover-bg)'
                          e.currentTarget.style.color = 'var(--nd-text-primary)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--nd-nav-inactive)'
                        }
                      }}
                    >
                      <Icon
                        className="shrink-0"
                        style={{
                          width: 18,
                          height: 18,
                          color: isActive ? 'var(--nd-nav-active-text)' : 'currentColor',
                        }}
                        strokeWidth={isActive ? 2 : 1.75}
                      />
                      {!collapsed && (
                        <>
                          <span
                            style={{
                              flex: 1,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.label}
                          </span>
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── Bottom section ── */}
        <div
          style={{
            marginTop: 'auto',
            padding: collapsed ? '12px 8px' : '12px',
            borderTop: '1px solid var(--nd-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: collapsed ? 'center' : 'stretch',
          }}
        >
          {collapsed ? (
            /* Collapsed: just user avatar */
            <div
              className="shrink-0 cursor-pointer"
              title={user?.name || 'User'}
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
          ) : (
            <>
              {/* Team card */}
              <div
                className="cursor-pointer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  marginBottom: 8,
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--nd-nav-hover-bg)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {/* Team gradient orb */}
                <div
                  className="shrink-0"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--nd-purple)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 'var(--font-xs)',
                    color: 'var(--nd-text-secondary)',
                    lineHeight: 'var(--lh-tight)',
                    margin: 0,
                  }}>
                    Team
                  </p>
                  <p style={{
                    fontSize: 'var(--font-base)',
                    fontWeight: 'var(--font-weight-medium)',
                    color: 'var(--nd-text-primary)',
                    lineHeight: 'var(--lh-tight)',
                    margin: 0,
                  }}>
                    Marketing
                  </p>
                </div>
                <ChevronRight
                  style={{
                    marginLeft: 'auto',
                    color: 'var(--nd-text-muted)',
                    width: 14,
                    height: 14,
                  }}
                />
              </div>

              {/* Upgrade Plan button */}
              <button
                className="cursor-pointer"
                style={{
                  width: '100%',
                  height: 36,
                  background: 'transparent',
                  border: '1px solid var(--nd-border)',
                  borderRadius: 8,
                  color: 'var(--nd-text-secondary)',
                  fontSize: 'var(--font-base)',
                  fontWeight: 'var(--font-weight-medium)',
                  transition: 'border-color 150ms ease, background 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--nd-border-hover)'
                  e.currentTarget.style.background = 'var(--nd-nav-hover-bg)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--nd-border)'
                  e.currentTarget.style.background = 'transparent'
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.99)' }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                Upgrade Plan
              </button>

              {/* Copyright */}
              <p style={{
                textAlign: 'center',
                fontSize: 'var(--font-xs)',
                color: 'var(--nd-text-muted)',
                margin: '12px 0 0 0',
                paddingBottom: 4,
              }}>
                © 2026 Contentlytics
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
