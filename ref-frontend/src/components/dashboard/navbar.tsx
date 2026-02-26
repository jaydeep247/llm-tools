'use client'

import { useState } from 'react'
import { Menu, ChevronDown, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface NavbarProps {
  onMenuToggle?: () => void
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const pathname = usePathname()

  // Helper to get title from pathname
  const getPageTitle = () => {
    const segments = pathname.split('/').filter(Boolean)
    const lastSegment = segments[segments.length - 1]
    if (!lastSegment || lastSegment === 'dashboard') return 'Dashboard'
    return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1)
  }

  return (
    <header className="flex h-16 items-center justify-between bg-transparent px-6 py-4 mb-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuToggle}
          className="md:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{getPageTitle()}</h1>
      </div>

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="bg-background rounded-md">
              <MoreHorizontal className="h-4 w-4 mr-2" />
              More
              <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-md">
            <DropdownMenuItem>Export Data</DropdownMenuItem>
            <DropdownMenuItem>View Analytics</DropdownMenuItem>
            <DropdownMenuItem>Share Dashboard</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" className="bg-background hidden sm:flex rounded-md">
          Submit Promotion
        </Button>
        
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm rounded-md">
          Log Complaint
        </Button>
      </div>
    </header>
  )
}