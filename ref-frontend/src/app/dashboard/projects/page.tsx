'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, ExternalLink, Trash2, FolderOpen, AlertCircle, Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useGetProjectsQuery, useCreateProjectMutation, type Project } from '@/store/api/projectApi'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ProjectEditDialog } from '@/components/dashboard/ProjectEditDialog'
import { ProjectDeleteDialog } from '@/components/dashboard/ProjectDeleteDialog'
import { ProjectsPageSkeleton } from '@/components/ui/PageLoader'

export default function ProjectsPage() {
  const router = useRouter()
  const { data, isLoading, error } = useGetProjectsQuery(undefined, { refetchOnMountOrArgChange: true })
  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation()
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })

  const handleCreateProject = async () => {
    if (!formData.name.trim()) {
      toast.error('Project name is required')
      return
    }

    try {
      await createProject({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
      }).unwrap()
      
      toast.success('Project created successfully')
      setIsCreateDialogOpen(false)
      setFormData({ name: '', description: '' })
    } catch (error: any) {
      toast.error(error?.data?.error || 'Failed to create project')
    }
  }

  const handleViewProject = (projectId: string) => {
    router.push(`/dashboard/projects/${projectId}`)
  }

  if (isLoading) return <ProjectsPageSkeleton />

  if (error) {
    return (
      <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
        <div className="flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
          <AlertCircle className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-red-400 mb-3 md:mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">Failed to load projects</h2>
          <p className="text-sm sm:text-base text-muted-foreground mb-3 md:mb-4">Please try again later</p>
          <Button onClick={() => window.location.reload()} className="bg-primary text-primary-foreground hover:opacity-90 text-sm cursor-pointer">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const projects = data?.projects || []
  return (
    <>
      <div className="space-y-4 animate-fade-in-hero">

        {/* Page header — always visible */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Projects</h1>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-primary text-primary-foreground hover:opacity-90 rounded-sm font-semibold px-4 text-sm h-9 cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" /> New Project
          </Button>
        </div>

        {/* Empty State */}
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-sm border border-border bg-card">
            <FolderOpen className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">No projects yet</h2>
            <p className="text-muted-foreground mb-6">Create your first project to get started</p>
          </div>
        ) : (
          /* Projects List */
          <div className="w-full mt-10 flex flex-col gap-2.5">
            {projects.map((project) => (
              <div
                key={project.id}
                className="w-full rounded-sm border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all duration-200 cursor-pointer"
                onClick={() => handleViewProject(project.id)}
              >
                {/* Top row: name + actions */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                   
                    <div className="min-w-0">
                      <span className="font-semibold text-xl text-foreground truncate">{project.name}</span>
                      {project.description && (
                        <span className="text-muted-foreground text-xs ml-2 truncate">{project.description}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleViewProject(project.id) }}
                      className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:ring-0 cursor-pointer rounded-sm"
                    >
                      <ExternalLink className="h-3 w-3 mr-1.5" /> View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setProjectToEdit(project) }}
                      className="h-7 px-2.5 text-xs text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/8 focus-visible:ring-0 cursor-pointer rounded-sm"
                    >
                      <Pencil className="h-3 w-3 mr-1.5" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setProjectToDelete(project) }}
                      className="h-7 px-2.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 focus-visible:ring-0 cursor-pointer rounded-sm"
                    >
                      <Trash2 className="h-3 w-3 mr-1.5" /> Delete
                    </Button>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-border" />

                {/* Metrics row */}
                <div className="flex items-end gap-12 px-5 pt-3 pb-4">
                  {/* Sessions */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground font-medium">Sessions</span>
                    <span className="text-sm font-semibold text-foreground">{project._count?.sessions || 0}</span>
                  </div>

                  {/* Status */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground font-medium">Status</span>
                    <span className={`text-sm font-semibold ${
                      project.status === 'ACTIVE' ? 'text-emerald-600' : 'text-muted-foreground'
                    }`}>
                      {project.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Created at */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground font-medium">Created at</span>
                    <span className="text-sm font-semibold text-foreground">
                      {new Date(project.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-white border-[#E2E8F0]">
          <DialogHeader>
            <DialogTitle className="text-[#0F172A]">Create New Project</DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              Create a new project to organize your crawl sessions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[#0F172A] cursor-pointer">Project Name</Label>
              <Input
                id="name"
                placeholder="My Website Project"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-[#F1F5F9] border-[#E2E8F0] text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-[#0F172A] cursor-pointer">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Project description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-[#F1F5F9] border-[#E2E8F0] text-[#0F172A] placeholder:text-[#94A3B8] min-h-25 focus:bg-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsCreateDialogOpen(false)}
              className="border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateProject}
              disabled={isCreating || !formData.name.trim()}
              className="bg-[#4F46E5] text-white hover:opacity-90 cursor-pointer disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  )
}
