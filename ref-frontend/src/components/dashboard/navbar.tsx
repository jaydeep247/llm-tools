'use client'

import { Menu, ChevronRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePathname, useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useGetProjectQuery } from '@/store/api'

interface NavbarProps {
  onMenuToggle?: () => void
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const pathname = usePathname()
  const params = useParams()
  const router = useRouter()

  // Check if we're on a project detail page
  const projectId = params.projectId as string | undefined
  const { data: projectData } = useGetProjectQuery(projectId || '', {
    skip: !projectId
  })

  // Generate breadcrumbs based on the current path
  const getBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean)
    
    // If we're on project detail page
    if (segments.includes('projects') && projectId && projectData) {
      return (
        <div className="flex items-center gap-1.5 sm:gap-2 text-white/80 text-xs sm:text-sm md:text-base">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/projects')}
            className="text-white hover:bg-white/20 hover:text-white rounded-full transition-all duration-300 h-7 w-7 sm:h-8 sm:w-8 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <Link 
            href="/dashboard/projects" 
            className="hover:text-white transition-colors cursor-pointer"
          >
            Projects
          </Link>
          <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-white/50" />
          <span className="text-white font-medium truncate max-w-37.5 sm:max-w-62.5 md:max-w-none">
            {projectData.project.name}
          </span>
        </div>
      )
    }
    
    return null
  }

  return (
    <nav className="fixed top-0 left-0 md:left-64 right-0 z-40 w-full md:w-[calc(100%-16rem)]">
      <div className="bg-white/10 backdrop-blur-2xl border-b border-white/20 shadow-lg shadow-black/20 h-12 sm:h-14 md:h-16 px-3 sm:px-4 md:px-6 flex items-center gap-3 sm:gap-4">
        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-white hover:bg-white/20 hover:text-white rounded-full transition-all duration-300 h-9 w-9 shrink-0"
          onClick={onMenuToggle}
        >
          <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
        
        {/* Breadcrumbs */}
        {getBreadcrumbs()}
      </div>
    </nav>
  )
}
