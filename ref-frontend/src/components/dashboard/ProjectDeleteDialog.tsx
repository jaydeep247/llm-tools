'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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

      toast({
        title: 'Project deleted',
        description: 'Your project has been successfully deleted.',
      })
      
      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast({
        title: 'Failed to delete project',
        description: error?.data?.message || 'An error occurred while deleting the project.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-[#0F172A] border-[#E2E8F0] sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle className="text-[#0F172A]">Delete Project</DialogTitle>
          <DialogDescription className="text-[#94A3B8]">
            Are you sure you want to delete <span className="font-semibold text-[#0F172A]">"{project?.name}"</span>? 
            This action cannot be undone and will permanently delete all associated crawl sessions.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDelete} 
            disabled={isLoading}
            className="bg-red-600 text-white hover:bg-red-700 cursor-pointer"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
