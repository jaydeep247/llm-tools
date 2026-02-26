'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  CheckSquare,
  GraduationCap,
  Percent,
  MessageSquare,
  FolderOpen,
  Users,
  FileText,
  Settings as SettingsIcon,
  ChevronsUpDown,
  LogOut
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
    label: 'Usage',
    href: '/dashboard/usage',
    icon: Percent,
  },
  {
    label: 'Subscriptions',
    href: '/dashboard/subscriptions',
    icon: Users,
  },
]

const bottomNavItems = [
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: SettingsIcon,
  },
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
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm md:hidden z-40"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-[288px] bg-[#0A0A0A] backdrop-blur-xl transition-transform duration-300 z-50 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
      >
        {/* Logo Section */}
        <div className="px-6 pt-4.25">
          <div className="flex items-center gap-3 h-16 mb-3">
            <div className="w-8 h-8 relative">
               <Image 
                 src="/images/attrock_logo.png" 
                 alt="Attrock" 
                 fill
                 className="object-contain"
               />
            </div>
            <span className="text-xl font-bold tracking-tight">Clarian</span>
          </div>

          {/* Role Selector */}
          <div className="mb-2 bg-[#222121] rounded-md ">
            <Select defaultValue="admin">
              <SelectTrigger className="w-full hover:bg-accent/70 border-border/40 h-auto py-7 pl-4 cursor-pointer rounded-md shadow-sm focus:ring-0 [&>svg]:hidden">
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="flex flex-col items-start text-left overflow-hidden">
                    <span className="text-sm font-semibold truncate w-full text-foreground">Administrator</span>
                    <span className="text-xs text-muted-foreground truncate w-full">Manage Team</span>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 text-muted-foreground mr-1" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-md transition-all duration-200 group',
                  isActive 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Bottom Section */}
        <div className="p-4 mt-auto space-y-1">
          {bottomNavItems.map((item) => {
             const isActive = pathname === item.href
             const Icon = item.icon
             
             return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-full transition-all duration-200 group',
                  isActive 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.label}
              </Link>
             )
          })}
        </div>
      </aside>
    </>
  )
}
