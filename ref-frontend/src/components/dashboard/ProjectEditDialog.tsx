'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
        },
      }).unwrap()

      toast({
        title: 'Project updated',
        description: 'Your project has been successfully updated.',
      })
      
      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast({
        title: 'Failed to update project',
        description: error?.data?.message || 'An error occurred while updating the project.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-[#0F172A] border-[#E2E8F0] sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle className="text-[#0F172A]">Edit Project</DialogTitle>
          <DialogDescription className="text-[#94A3B8]">
            Make changes to your project here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-[#0F172A] font-medium">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[#F1F5F9] border-[#E2E8F0] text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description" className="text-[#0F172A] font-medium">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-[#F1F5F9] border-[#E2E8F0] text-[#0F172A] placeholder:text-[#94A3B8] min-h-25 focus:bg-white"
            />
          </div>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleUpdate} 
            disabled={isLoading || !name.trim()}
            className="bg-[#4F46E5] text-white hover:opacity-90 cursor-pointer"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
