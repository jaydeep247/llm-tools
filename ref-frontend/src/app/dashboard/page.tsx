'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, TrendingUp, Users, Zap, FolderOpen, MoreVertical, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGetProjectsQuery, useDeleteProjectMutation, type Project } from '@/store/api/projectApi'
import { useToast } from '@/hooks/use-toast'
import { AuthModal } from '@/components/auth/auth-modal'
import { useAuth } from '@/hooks/useAuth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProjectEditDialog } from '@/components/dashboard/ProjectEditDialog'
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider'

export default function DashboardPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { confirm } = useGlobalDialog()
  const { isAuthenticated, refreshAuth } = useAuth()
  const { data: projectsData } = useGetProjectsQuery(undefined, { refetchOnMountOrArgChange: true })
  const [deleteProject] = useDeleteProjectMutation()
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)

  const handleAuthSuccess = () => {
    refreshAuth()
  }

  const handleDeleteProject = async (project: Project) => {
    const isConfirmed = await confirm({
      title: 'Delete Project',
      description: `Are you sure you want to delete "${project.name}"? This action cannot be undone and will permanently delete all associated crawl sessions.`,
      confirmText: 'Delete Project',
      variant: 'destructive',
    })

    if (isConfirmed) {
      try {
        await deleteProject(project.id).unwrap()
        toast({
          title: 'Project deleted',
          description: 'Your project has been successfully deleted.',
        })
      } catch (error: any) {
        toast({
          title: 'Failed to delete project',
          description: error?.data?.message || 'An error occurred while deleting the project.',
          variant: 'destructive',
        })
      }
    }
  }

  const handleViewProject = (projectId: string) => {
    router.push(`/dashboard/projects/${projectId}`)
  }

  const totalProjects = projectsData?.projects?.length || 0

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white text-balance">
          Welcome back to your{' '}
          <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-slate-200">
            Dashboard
          </span>
        </h1>
        <p className="text-white/70 text-sm sm:text-base md:text-lg lg:text-xl font-light">
          Manage your projects, subscriptions, and API usage all in one place
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
        {/* Total Projects Card */}
        <button 
          onClick={() => router.push('/dashboard/projects')}
          className="group rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 cursor-pointer text-left"
        >
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-white/70">Total Projects</span>
              <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1 md:space-y-2">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{totalProjects}</p>
              <p className="text-[10px] sm:text-xs text-white/60 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-white/80" />
                Click to manage
              </p>
            </div>
          </div>
        </button>

        {/* Current Plan Card */}
        <div className="group rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 cursor-pointer">
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-white/70">Current Plan</span>
              <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1 md:space-y-2">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">Pro</p>
              <p className="text-[10px] sm:text-xs text-white/60">Renews on Dec 15, 2024</p>
            </div>
          </div>
        </div>

        {/* API Usage Card */}
        <div className="group rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 cursor-pointer">
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-white/70">API Usage</span>
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-2 md:space-y-3">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">45%</p>
              <div className="w-full bg-white/10 rounded-full h-1.5 md:h-2 overflow-hidden">
                <div className="bg-white/60 h-full rounded-full w-[45%]" />
              </div>
              <p className="text-[10px] sm:text-xs text-white/60">Of monthly quota</p>
            </div>
          </div>
        </div>

        {/* Team Members Card */}
        <div className="group rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 cursor-pointer">
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-white/70">Team Members</span>
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1 md:space-y-2">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">5</p>
              <p className="text-[10px] sm:text-xs text-white/60">Active members</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Projects Section */}
      <div className="space-y-3 md:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">Recent Projects</h2>
          <Button 
            onClick={() => router.push('/dashboard/projects')}
            className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-xs sm:text-sm px-3 sm:px-4 md:px-6 h-8 sm:h-9 md:h-10 cursor-pointer"
          >
            View All
            <ArrowRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {projectsData?.projects && projectsData.projects.length > 0 ? (
            projectsData.projects.slice(0, 4).map((project) => (
              <div
                key={project.id}
                onClick={() => handleViewProject(project.id)}
                className="group relative rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 text-left cursor-pointer"
              >
                <div className="space-y-3 md:space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-white">{project.name}</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-white/60 hover:text-white/80 hover:bg-white/10 rounded-full h-8 w-8 -mr-2 -mt-2"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border border-white/20">
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewProject(project.id)
                          }}
                          className="cursor-pointer text-white hover:bg-white/10"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation()
                            setProjectToEdit(project)
                          }}
                          className="cursor-pointer text-white hover:bg-white/10"
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteProject(project)
                          }}
                          className="text-red-400 cursor-pointer hover:bg-red-500/10"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] sm:text-xs font-medium px-2 sm:px-3 py-1 rounded-full ${
                        project.status === 'ACTIVE' 
                          ? 'bg-green-500/20 text-green-300' 
                          : 'bg-gray-500/20 text-gray-300'
                      }`}>
                        {project.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-[10px] sm:text-xs text-white/60">
                        {project._count?.sessions || 0} sessions
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/60 line-clamp-2">
                      {project.description || 'No description'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 rounded-xl md:rounded-2xl p-8 sm:p-10 md:p-12 border border-white/20 bg-white/10 backdrop-blur-xl text-center">
              <FolderOpen className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-white/40 mx-auto mb-3 md:mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">No projects yet</h3>
              <p className="text-sm sm:text-base text-white/60 mb-4 md:mb-6">Create your first project to get started</p>
              <Button 
                onClick={() => router.push('/dashboard/projects')}
                className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-sm cursor-pointer"
              >
                Create Project
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3 md:space-y-4">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <button 
            onClick={() => router.push('/dashboard/projects')}
            className="rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 text-left group cursor-pointer"
          >
            <div className="space-y-1.5 md:space-y-2">
              <p className="text-base sm:text-lg font-semibold text-white group-hover:text-white/90">+ New Project</p>
              <p className="text-xs sm:text-sm text-white/60">Create a new project to organize your crawls</p>
            </div>
          </button>
          <button 
            onClick={() => router.push('/dashboard/usage')}
            className="rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 text-left group cursor-pointer"
          >
            <div className="space-y-1.5 md:space-y-2">
              <p className="text-base sm:text-lg font-semibold text-white group-hover:text-white/90">View Usage</p>
              <p className="text-xs sm:text-sm text-white/60">Check your API usage and quota</p>
            </div>
          </button>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Edit Project Dialog */}
      <ProjectEditDialog
        project={projectToEdit}
        open={!!projectToEdit}
        onOpenChange={(open) => !open && setProjectToEdit(null)}
      />
    </div>
  )
}
