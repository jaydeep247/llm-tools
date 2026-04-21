'use client'

import { NdDialog, NdDialogTitle, NdDialogDescription, NdDialogFooter } from '@/components/dashboard/ui/nd-dialog'
import { useDeleteProjectMutation, type Project } from '@/store/api/projectApi'
import { toast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

interface ProjectDeleteDialogProps {
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ProjectDeleteDialog({ project, open, onOpenChange, onSuccess }: ProjectDeleteDialogProps) {
  const [deleteProject, { isLoading }] = useDeleteProjectMutation()

  const handleDelete = async () => {
    if (!project) return
    try {
      await deleteProject(project.id).unwrap()
      toast({ title: 'Project deleted', description: 'Your project has been successfully deleted.' })
      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast({ title: 'Failed to delete project', description: error?.data?.message || 'An error occurred while deleting the project.', variant: 'destructive' })
    }
  }

  return (
    <NdDialog open={open} onOpenChange={onOpenChange}>
      <NdDialogTitle>Delete Project</NdDialogTitle>
      <NdDialogDescription>
        Are you sure you want to delete <span style={{ fontWeight: 600, color: '#1A1D2B' }}>&quot;{project?.name}&quot;</span>?
        This action cannot be undone and will permanently delete all associated crawl sessions.
      </NdDialogDescription>
      <NdDialogFooter>
        <button onClick={() => onOpenChange(false)} className="nd-btn-outline cursor-pointer">
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={isLoading}
          className="nd-btn-danger cursor-pointer"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Delete Project
        </button>
      </NdDialogFooter>
    </NdDialog>
  )
}
