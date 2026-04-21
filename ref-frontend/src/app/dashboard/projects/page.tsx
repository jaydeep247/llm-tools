'use client'

import { useState } from 'react'
import { Plus, ExternalLink, Trash2, FolderOpen, AlertCircle, Pencil, MoreVertical } from 'lucide-react'
import { NdDialog, NdDialogTitle, NdDialogDescription, NdDialogFooter } from '@/components/dashboard/ui/nd-dialog'
import { useGetProjectsQuery, useCreateProjectMutation, type Project } from '@/store/api/projectApi'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ProjectEditDialog } from '@/components/dashboard/ProjectEditDialog'
import { ProjectDeleteDialog } from '@/components/dashboard/ProjectDeleteDialog'
import { ProjectsPageSkeleton } from '@/components/ui/PageLoader'
import { NdDropdown, NdDropdownItem } from '@/components/dashboard/ui/nd-dropdown'

export default function ProjectsPage() {
  const router = useRouter()
  const { data, isLoading, error } = useGetProjectsQuery(undefined, { refetchOnMountOrArgChange: true })
  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })

  const handleCreateProject = async () => {
    if (!formData.name.trim()) { toast.error('Project name is required'); return }
    try {
      await createProject({ name: formData.name.trim(), description: formData.description.trim() || undefined }).unwrap()
      toast.success('Project created successfully')
      setIsCreateDialogOpen(false)
      setFormData({ name: '', description: '' })
    } catch (error: any) {
      toast.error(error?.data?.error || 'Failed to create project')
    }
  }

  const handleViewProject = (projectId: string) => router.push(`/dashboard/projects/${projectId}`)

  if (isLoading) return <ProjectsPageSkeleton />

  if (error) {
    return (
      <div className="nd-empty-state nd-card" style={{ padding: '80px 24px' }}>
        <AlertCircle size={48} strokeWidth={1.5} className="nd-empty-icon" style={{ color: '#EF4444' }} />
        <h2 className="nd-empty-title">Failed to load projects</h2>
        <p className="nd-empty-text">Something went wrong. Please try again.</p>
        <button onClick={() => window.location.reload()} className="nd-btn-primary cursor-pointer">
          Retry
        </button>
      </div>
    )
  }

  const projects = data?.projects || []

  return (
    <>
      <div className="nd-projects-page">
        {/* Header */}
        <div className="nd-section-header">
          <h1 className="nd-page-title" style={{ fontSize: 'var(--font-xl)' }}>Projects</h1>
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="nd-btn-primary cursor-pointer"
          >
            <Plus size={16} strokeWidth={2} />
            New Project
          </button>
        </div>

        {/* Project list */}
        {projects.length === 0 ? (
          <div className="nd-card nd-empty-state">
            <FolderOpen size={48} strokeWidth={1.5} className="nd-empty-icon" />
            <h2 className="nd-empty-title">No projects yet</h2>
            <p className="nd-empty-text">Create your first project to get started</p>
            <button
              onClick={() => setIsCreateDialogOpen(true)}
              className="nd-btn-primary cursor-pointer"
            >
              <Plus size={15} />
              Create Project
            </button>
          </div>
        ) : (
          <div className="nd-projects-list">
            {projects.map((project, i) => (
              <div
                key={project.id}
                className="nd-card nd-card-clickable nd-project-row group cursor-pointer"
                onClick={() => handleViewProject(project.id)}
              >
                {/* Top row: name + actions */}
                <div className="nd-project-row-top">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 className="nd-project-row-name">{project.name}</h3>
                    {project.description && (
                      <p className="nd-project-row-desc">{project.description}</p>
                    )}
                  </div>

                  <div className="nd-project-row-actions" onClick={(e) => e.stopPropagation()}>
                    <NdDropdown
                      trigger={
                        <button className="nd-menu-trigger cursor-pointer">
                          <MoreVertical size={16} />
                        </button>
                      }
                      align="end"
                    >
                      <NdDropdownItem onClick={() => handleViewProject(project.id)}>
                        <ExternalLink className="mr-2 h-4 w-4" /> View
                      </NdDropdownItem>
                      <NdDropdownItem onClick={() => setProjectToEdit(project)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </NdDropdownItem>
                      <NdDropdownItem danger onClick={() => setProjectToDelete(project)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </NdDropdownItem>
                    </NdDropdown>
                  </div>
                </div>

                {/* Divider */}
                <div className="nd-project-row-divider" />

                {/* Bottom row: stats */}
                <div className="nd-project-row-stats">
                  <div className="nd-project-row-stat">
                    <span className="nd-project-row-stat-label">Sessions</span>
                    <span className="nd-project-row-stat-value">{project._count?.sessions || 0}</span>
                  </div>
                  <div className="nd-project-row-stat">
                    <span className="nd-project-row-stat-label">Status</span>
                    <span className={`nd-badge ${project.status === 'ACTIVE' ? 'nd-badge-active' : 'nd-badge-inactive'}`}>
                      {project.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="nd-project-row-stat">
                    <span className="nd-project-row-stat-label">Created</span>
                    <span className="nd-project-row-stat-value">
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
      <NdDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <NdDialogTitle>Create New Project</NdDialogTitle>
        <NdDialogDescription>
          Create a new project to organize your crawl sessions
        </NdDialogDescription>
        <div className="nd-dialog-body">
          <div className="nd-field">
            <label htmlFor="create-name" className="nd-label">Project Name</label>
            <input
              id="create-name"
              placeholder="My Website Project"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="nd-input"
            />
          </div>
          <div className="nd-field">
            <label htmlFor="create-desc" className="nd-label">Description (optional)</label>
            <textarea
              id="create-desc"
              placeholder="Project description..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="nd-textarea"
              rows={3}
            />
          </div>
        </div>
        <NdDialogFooter>
          <button
            onClick={() => setIsCreateDialogOpen(false)}
            className="nd-btn-outline cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateProject}
            disabled={isCreating || !formData.name.trim()}
            className="nd-btn-primary cursor-pointer"
          >
            {isCreating ? 'Creating...' : 'Create Project'}
          </button>
        </NdDialogFooter>
      </NdDialog>

      <ProjectEditDialog
        project={projectToEdit}
        open={!!projectToEdit}
        onOpenChange={(open) => !open && setProjectToEdit(null)}
      />
      <ProjectDeleteDialog
        project={projectToDelete}
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
      />
    </>
  )
}
