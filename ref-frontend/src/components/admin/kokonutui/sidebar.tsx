'use client'

import { useRef } from 'react'
import {
  Home,
  Users2,
  TrendingUp,
  BarChart2,
  Zap,
  Flag,
  Brain,
  MessageSquare,
  Activity,
  FileText,
  Settings,
  PanelLeft,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const sectionColors: Record<string, string> = {
  business: 'text-emerald-400',
  product: 'text-blue-400',
  intelligence: 'text-violet-400',
  system: 'text-orange-400',
}

type Child = { id: string; label: string; icon: LucideIcon; href: string }
type Section = { id: string; label: string; icon: LucideIcon; href?: string; children: Child[] }

export const adminSections: Section[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    href: '/admin/overview',
    children: [],
  },
  {
    id: 'business',
    label: 'Business',
    icon: BarChart2,
    children: [
      { id: 'accounts', label: 'Accounts & Users', icon: Users2, href: '/admin/accounts' },
      { id: 'revenue', label: 'Revenue', icon: TrendingUp, href: '/admin/revenue' },
    ],
  },
  {
    id: 'product',
    label: 'Product',
    icon: Zap,
    children: [
      { id: 'features', label: 'Features', icon: BarChart2, href: '/admin/features' },
      { id: 'patterns', label: 'Winning Patterns', icon: Zap, href: '/admin/patterns' },
      { id: 'experiments', label: 'Experiments', icon: Flag, href: '/admin/experiments' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    icon: Brain,
    children: [
      { id: 'intelligence-lab', label: 'LLM Quality Lab', icon: Brain, href: '/admin/intelligence' },
      { id: 'support', label: 'Support Feedback', icon: MessageSquare, href: '/admin/support' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Activity,
    children: [
      { id: 'health', label: 'Health', icon: Activity, href: '/admin/health' },
      { id: 'reports', label: 'Reports', icon: FileText, href: '/admin/reports' },
      { id: 'settings', label: 'Settings', icon: Settings, href: '/admin/settings' },
    ],
  },
]

interface AdminSidebarProps {
  isOpen?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export default function AdminSidebar({
  isOpen = true,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const navRef = useRef<HTMLDivElement>(null)
  const dashboard = adminSections[0]
  const sectionsWithChildren = adminSections.filter((s) => s.children.length > 0)

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

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
          'fixed left-0 top-0 h-screen bg-[#09090B] transition-all duration-300 ease-in-out z-50 flex flex-col overflow-hidden',
          collapsed ? 'w-14' : 'w-68',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="px-5 flex items-center justify-between h-18">
          <span
            className={cn(
              'text-xl font-bold tracking-tight text-white whitespace-nowrap overflow-hidden transition-all duration-300',
              collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'
            )}
          >
            Admin
          </span>
          <button
            onClick={onToggleCollapse}
            className={cn(
              'p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all duration-200 shrink-0',
              collapsed && 'mx-auto'
            )}
          >
            <PanelLeft className={cn('w-4 h-4 transition-transform duration-300', collapsed && 'rotate-180')} />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 h-px bg-zinc-800 shrink-0" />

        {/* Navigation */}
        <div ref={navRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-3">

          {/* Dashboard – standalone */}
          <div className={cn('transition-all duration-300', collapsed ? 'px-2' : 'px-3')}>
            <div className="relative group/dash">
              <Link
                href={dashboard.href!}
                onClick={onClose}
                className={cn(
                  'flex items-center w-full rounded-sm text-[13px] font-medium transition-all duration-200',
                  collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2',
                  isActive(dashboard.href!)
                    ? 'bg-indigo-500/10 text-indigo-200'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                )}
              >
                <dashboard.icon
                  className={cn(
                    'shrink-0 transition-all duration-200',
                    collapsed ? 'w-5 h-5' : 'w-4 h-4',
                    isActive(dashboard.href!) ? 'text-indigo-400' : 'text-zinc-500'
                  )}
                />
                <span
                  className={cn(
                    'whitespace-nowrap overflow-hidden transition-all duration-300',
                    collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'
                  )}
                >
                  {dashboard.label}
                </span>
              </Link>

              {/* Tooltip in collapsed mode */}
              {collapsed && (
                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50">
                  <div className="opacity-0 group-hover/dash:opacity-100 transition-opacity duration-150 flex items-center">
                    <div className="w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-zinc-700" />
                    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 whitespace-nowrap shadow-xl">
                      {dashboard.label}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sections with children */}
          {sectionsWithChildren.map((section) => (
            <div key={section.id} data-parent-section-id={section.id}>
              {/* Dotted separator */}
              <div className={cn('my-1.5 border-t border-dashed border-zinc-800 transition-all duration-300', collapsed ? 'mx-2' : 'mx-5')} />

              {/* Group label */}
              <div
                className={cn(
                  'flex items-center gap-2 py-1 overflow-hidden transition-all duration-300',
                  collapsed ? 'opacity-0 max-h-0 py-0' : 'opacity-100 max-h-10 px-8'
                )}
              >
                <section.icon className={cn('w-3.5 h-3.5 shrink-0', sectionColors[section.id] || 'text-zinc-400')} />
                <span className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                  {section.label}
                </span>
              </div>

              {/* Children */}
              <div className={cn('space-y-0 transition-all duration-300', collapsed ? 'px-2' : 'pl-9 pr-3')}>
                {section.children.map((child) => {
                  const active = isActive(child.href)
                  const ChildIcon = child.icon
                  return (
                    <div key={child.id} className="relative group/child">
                      <Link
                        href={child.href}
                        onClick={onClose}
                        className={cn(
                          'flex items-center w-full rounded-sm text-[12.5px] transition-all duration-200 text-left',
                          collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-1.5',
                          active
                            ? 'bg-indigo-500/10 text-white font-medium'
                            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/40'
                        )}
                      >
                        <ChildIcon
                          className={cn(
                            'shrink-0 transition-all duration-200',
                            collapsed ? 'w-5 h-5' : 'w-3.5 h-3.5',
                            active ? 'text-indigo-400' : 'text-zinc-600'
                          )}
                        />
                        <span
                          className={cn(
                            'truncate overflow-hidden transition-all duration-300',
                            collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'
                          )}
                        >
                          {child.label}
                        </span>
                      </Link>

                      {/* Tooltip in collapsed mode */}
                      {collapsed && (
                        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50">
                          <div className="opacity-0 group-hover/child:opacity-100 transition-opacity duration-150 flex items-center">
                            <div className="w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-zinc-700" />
                            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 whitespace-nowrap shadow-xl">
                              {child.label}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
