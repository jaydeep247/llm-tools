'use client'

import { useState, useEffect } from 'react'
import { NdDialog, NdDialogTitle, NdDialogDescription, NdDialogFooter } from '@/components/dashboard/ui/nd-dialog'
import { useUpdateProjectMutation, type Project } from '@/store/api/projectApi'
import { toast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

interface ProjectEditDialogProps {
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ProjectEditDialog({ project, open, onOpenChange, onSuccess }: ProjectEditDialogProps) {
  const [updateProject, { isLoading }] = useUpdateProjectMutation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description || '')
    }
  }, [project])

  const handleUpdate = async () => {
    if (!project || !name.trim()) return
    try {
      await updateProject({
        projectId: project.id,
        data: { name: name.trim(), description: description.trim() || undefined },
      }).unwrap()
      toast({ title: 'Project updated', description: 'Your project has been successfully updated.' })
      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast({ title: 'Failed to update project', description: error?.data?.message || 'An error occurred while updating the project.', variant: 'destructive' })
    }
  }

  return (
    <NdDialog open={open} onOpenChange={onOpenChange}>
      <NdDialogTitle>Edit Project</NdDialogTitle>
      <NdDialogDescription>
        Make changes to your project here. Click save when you&apos;re done.
      </NdDialogDescription>
      <div className="nd-dialog-body">
        <div className="nd-field">
          <label htmlFor="edit-name" className="nd-label">Name</label>
          <input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="nd-input"
          />
        </div>
        <div className="nd-field">
          <label htmlFor="edit-description" className="nd-label">Description</label>
          <textarea
            id="edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="nd-textarea"
            rows={3}
          />
        </div>
      </div>
      <NdDialogFooter>
        <button onClick={() => onOpenChange(false)} className="nd-btn-outline cursor-pointer">
          Cancel
        </button>
        <button
          onClick={handleUpdate}
          disabled={isLoading || !name.trim()}
          className="nd-btn-primary cursor-pointer"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </button>
      </NdDialogFooter>
    </NdDialog>
  )
}
