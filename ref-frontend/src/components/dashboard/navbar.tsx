'use client'

import { useEffect, useState } from 'react'
import { Menu, ChevronRight, ArrowLeft, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePathname, useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useGetProjectQuery } from '@/store/api/projectApi'
import { useAuth } from '@/hooks/useAuth'
import { UserRole } from '@/types/auth'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface NavbarProps {
  onMenuToggle?: () => void
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const pathname = usePathname()
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.ANALYST)

  const projectId = params.projectId as string | undefined
  const { data: projectData } = useGetProjectQuery(projectId || '', {
    skip: !projectId,
    refetchOnMountOrArgChange: true
  })

  useEffect(() => {
    const defaultRole = user?.role || UserRole.ANALYST

    if (typeof window !== 'undefined') {
      const storedRole = window.localStorage.getItem('dashboardUserRole')
      const roles = Object.values(UserRole) as string[]

      if (storedRole && roles.includes(storedRole)) {
        setSelectedRole(storedRole as UserRole)
        return
      }
    }

    setSelectedRole(defaultRole)
  }, [user])

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dashboardUserRole', role)
    }
  }

  const getBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean)

    if (segments.includes('projects') && projectId && projectData) {
      return (
        <div
          className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base"
          style={{ color: '#9F9395', fontFamily: "'DM Sans', 'Geist', sans-serif" }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/projects')}
            className="rounded-full transition-all duration-300 h-7 w-7 sm:h-8 sm:w-8 shrink-0 cursor-pointer"
            style={{ color: '#CCD1D5' }}
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <Link
            href="/dashboard/projects"
            className="transition-colors cursor-pointer hover:text-[#FDFFFD]"
            style={{ color: '#9F9395' }}
          >
            Projects
          </Link>
          <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" style={{ color: '#54595B' }} />
          <span
            className="font-medium truncate max-w-37.5 sm:max-w-62.5 md:max-w-none"
            style={{ color: '#FDFFFD' }}
          >
            {projectData.project.name}
          </span>
        </div>
      )
    }

    return null
  }

  const roleLabel = (role: UserRole) => {
    return role
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    <nav
      className="fixed top-0 left-0 md:left-64 right-0 z-40 w-full md:w-[calc(100%-16rem)]"
      style={{ fontFamily: "'DM Sans', 'Geist', sans-serif" }}
    >
      <div
        className="border-b h-12 sm:h-14 md:h-16 px-3 sm:px-4 md:px-6 flex items-center justify-between gap-3 sm:gap-4"
        style={{
          background: 'rgba(14, 14, 15, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderColor: '#54595B',
        }}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden rounded-full transition-all duration-300 h-9 w-9 shrink-0"
            style={{ color: '#CCD1D5' }}
            onClick={onMenuToggle}
          >
            <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          {getBreadcrumbs()}
        </div>

        <div className="hidden sm:flex items-center gap-2 ml-auto">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{
              background: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.2)',
            }}
          >
            <Shield className="h-4 w-4" style={{ color: '#34D399' }} />
          </div>
          <Select
            value={selectedRole}
            onValueChange={(value) => handleRoleChange(value as UserRole)}
          >
            <SelectTrigger
              size="sm"
              className="h-9 transition-all duration-200 gap-2.5 px-3 w-45 shadow-sm justify-between text-sm font-medium cursor-pointer"
              style={{
                background: '#1B1D21',
                border: '1px solid #54595B',
                color: '#CCD1D5',
              }}
            >
              <div className="flex items-center gap-2.5">
                <SelectValue placeholder="Select role">
                  <span style={{ color: '#CCD1D5' }}>{roleLabel(selectedRole)}</span>
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent
              className="min-w-45"
              style={{
                background: '#1B1D21',
                border: '1px solid #54595B',
                color: '#CCD1D5',
              }}
            >
              {Object.values(UserRole).map((role) => (
                <SelectItem
                  key={role}
                  value={role}
                  className="cursor-pointer py-2.5 text-sm"
                  style={{ color: '#CCD1D5' }}
                >
                  {roleLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </nav>
  )
}