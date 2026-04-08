'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, TrendingUp, Users, Zap, FolderOpen, MoreVertical, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGetProjectsQuery, type Project } from '@/store/api/projectApi'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/useAuth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProjectEditDialog } from '@/components/dashboard/ProjectEditDialog'
import { ProjectDeleteDialog } from '@/components/dashboard/ProjectDeleteDialog'
import { GreetingHeader } from '@/components/dashboard/GreetingHeader'
import { LiveCrawlActivity } from '@/components/dashboard/LiveCrawlActivity'
import { StatCard, StatCardGrid } from '@/components/ui/StatCard'

export default function DashboardPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { isAuthenticated, refreshAuth } = useAuth()
  const { data: projectsData } = useGetProjectsQuery(undefined, { refetchOnMountOrArgChange: true })
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

  const handleViewProject = (projectId: string) => {
    router.push(`/dashboard/projects/${projectId}`)
  }

  const totalProjects = projectsData?.projects?.length || 0

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
      <GreetingHeader />
      
      {/* Stats Grid */}
      <StatCardGrid>
        <StatCard
          label="Total Projects"
          value={totalProjects}
          subtext="Click to manage"
          icon={FolderOpen}
          accent="blue"
          trend="neutral"
          onClick={() => router.push('/dashboard/projects')}
        />
        <StatCard
          label="Current Plan"
          value="Pro"
          subtext="Renews on Dec 15, 2024"
          icon={Zap}
          accent="violet"
        />
        <StatCard
          label="API Usage"
          value="45%"
          subtext="Of monthly quota"
          icon={TrendingUp}
          accent="emerald"
          progress={45}
        />
        <StatCard
          label="Team Members"
          value={5}
          subtext="Active members"
          icon={Users}
          accent="amber"
        />
      </StatCardGrid>

      {/* Recent Projects Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-foreground">Recent Projects</h2>
          <Button 
            onClick={() => router.push('/dashboard/projects')}
            className="bg-primary text-primary-foreground hover:opacity-90 rounded-full font-semibold text-xs px-3 h-8 cursor-pointer"
          >
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {projectsData?.projects && projectsData.projects.length > 0 ? (
            projectsData.projects.slice(0, 4).map((project) => (
              <div
                key={project.id}
                onClick={() => handleViewProject(project.id)}
                className="group relative rounded-xl p-3 sm:p-4 border border-border bg-card hover:border-primary/20 hover:shadow-md transition-all duration-300 text-left cursor-pointer"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm sm:text-base font-semibold text-foreground">{project.name}</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full h-7 w-7 -mr-2 -mt-2"
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white border border-[#E2E8F0] shadow-md rounded-lg text-[#0F172A]">
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewProject(project.id)
                          }}
                          className="cursor-pointer text-[#0F172A] hover:bg-[#F1F5F9] focus:bg-[#F1F5F9]"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation()
                            setProjectToEdit(project)
                          }}
                          className="cursor-pointer text-[#0F172A] hover:bg-[#F1F5F9] focus:bg-[#F1F5F9]"
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation()
                            setProjectToDelete(project)
                          }}
                          className="text-red-500 cursor-pointer hover:bg-red-50 focus:bg-red-50"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        project.status === 'ACTIVE' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-secondary text-muted-foreground'
                      }`}>
                        {project.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {project._count?.sessions || 0} sessions
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {project.description || 'No description'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 rounded-xl p-6 sm:p-8 border border-border bg-card text-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold text-foreground mb-1">No projects yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create your first project to get started</p>
              <Button 
                onClick={() => router.push('/dashboard/projects')}
                className="bg-primary text-primary-foreground hover:opacity-90 rounded-full font-semibold text-xs cursor-pointer"
              >
                Create Project
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Live / Recent Crawl Activity */}
      {projectsData?.projects && projectsData.projects.length > 0 && (
        <LiveCrawlActivity projects={projectsData.projects.slice(0, 8)} />
      )}

      {/* Quick Actions */}
      <div className="space-y-2">
        <h2 className="text-base sm:text-lg font-bold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button 
            onClick={() => router.push('/dashboard/projects')}
            className="rounded-xl p-3 sm:p-4 border border-border bg-card hover:border-primary/20 hover:shadow-md transition-all duration-300 text-left group cursor-pointer"
          >
            <div className="space-y-1">
              <p className="text-sm sm:text-base font-semibold text-primary group-hover:text-primary/80">+ New Project</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Create a new project to organize your crawls</p>
            </div>
          </button>
          <button 
            onClick={() => router.push('/dashboard/usage')}
            className="rounded-xl p-3 sm:p-4 border border-border bg-card hover:border-emerald-500/20 hover:shadow-md transition-all duration-300 text-left group cursor-pointer"
          >
            <div className="space-y-1">
              <p className="text-sm sm:text-base font-semibold text-emerald-600 group-hover:text-emerald-700">View Usage</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Check your API usage and quota</p>
            </div>
          </button>
        </div>
      </div>

      {/* Edit Project Dialog */}
      <ProjectEditDialog
        project={projectToEdit}
        open={!!projectToEdit}
        onOpenChange={(open) => !open && setProjectToEdit(null)}
      />

      {/* Delete Project Dialog */}
      <ProjectDeleteDialog
        project={projectToDelete}
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
      />
    </div>
  )
}
