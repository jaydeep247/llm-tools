'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, MoreVertical, ExternalLink, Trash2, FolderOpen, Clock, AlertCircle, Pencil } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
          <div className="space-y-1 md:space-y-2">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white">Projects</h1>
            <p className="text-white/70 text-sm sm:text-base md:text-lg font-light">
              Loading your projects...
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg p-3 sm:p-4 md:p-5 border border-white/20 bg-white/10 backdrop-blur-xl animate-pulse">
              <div className="h-16 sm:h-20 bg-white/10 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
        <div className="flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
          <AlertCircle className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-red-400 mb-3 md:mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Failed to load projects</h2>
          <p className="text-sm sm:text-base text-white/60 mb-3 md:mb-4">Please try again later</p>
          <Button onClick={() => window.location.reload()} className="bg-white text-black hover:bg-slate-100 text-sm cursor-pointer">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const projects = data?.projects || []
  return (
    <>
      <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
          <div className="space-y-1 md:space-y-2">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white">Projects</h1>
            <p className="text-white/70 text-sm sm:text-base md:text-lg font-light">
              Manage and organize all your crawl sessions
            </p>
          </div>
          <Button 
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold px-4 sm:px-5 md:px-6 text-xs sm:text-sm h-9 sm:h-10 cursor-pointer"
          >
            <Plus className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> New Project
          </Button>
        </div>

        {/* Empty State */}
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16 md:py-20 rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl">
            <FolderOpen className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-white/40 mb-3 md:mb-4" />
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">No projects yet</h2>
            <p className="text-sm sm:text-base text-white/60 mb-4 md:mb-6">Create your first project to get started</p>
            <Button 
              onClick={() => setIsCreateDialogOpen(true)}
              className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold px-4 sm:px-5 md:px-6 text-xs sm:text-sm cursor-pointer"
            >
              <Plus className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Create Project
            </Button>
          </div>
        ) : (
          /* Projects Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group rounded-lg p-3 sm:p-4 md:p-5 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 flex flex-col cursor-pointer"
                onClick={() => handleViewProject(project.id)}
              >
                <div className="space-y-2 md:space-y-3 flex-1">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base text-white group-hover:text-white/90 transition-colors truncate">
                        {project.name}
                      </h3>
                      <p className="text-[10px] sm:text-xs text-white/60 mt-0.5 line-clamp-2">
                        {project.description || 'No description'}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-white/60 hover:text-white/80 hover:bg-white/10 rounded-full h-7 w-7 sm:h-8 sm:w-8 cursor-pointer shrink-0"
                        >
                          <MoreVertical className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent 
                        align="end" 
                        className="bg-zinc-900 border border-white/20 rounded-lg"
                      >
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewProject(project.id)
                          }}
                          className="cursor-pointer text-white hover:bg-white/10"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" /> View Sessions
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
                            setProjectToDelete(project)
                          }}
                          className="text-red-400 cursor-pointer hover:bg-red-500/10"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Stats */}
                  <div className="space-y-1.5 md:space-y-2">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs">
                      <span className="text-white/60">Crawl Sessions</span>
                      <span className="text-white font-semibold">
                        {project._count?.sessions || 0}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-[10px] sm:text-xs">
                      <span className="text-white/60">Status</span>
                      <span className={`font-medium px-2 py-0.5 rounded text-[9px] sm:text-[10px] ${
                        project.status === 'ACTIVE' 
                          ? 'bg-green-500/20 text-green-300' 
                          : 'bg-gray-500/20 text-gray-300'
                      }`}>
                        {project.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    
                    <div className="flex items-center text-[9px] sm:text-[10px] text-white/50 pt-1">
                      <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                      Created {new Date(project.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-zinc-900 border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Project</DialogTitle>
            <DialogDescription className="text-white/60">
              Create a new project to organize your crawl sessions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-white">Project Name</Label>
              <Input
                id="name"
                placeholder="My Website Project"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-white">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Project description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 min-h-25"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsCreateDialogOpen(false)}
              className="border-white/20 text-white hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateProject}
              disabled={isCreating || !formData.name.trim()}
              className="bg-white text-black hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed"
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
