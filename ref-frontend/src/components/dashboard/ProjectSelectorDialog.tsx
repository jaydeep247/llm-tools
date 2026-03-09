'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X, Loader2, FolderOpen, Plus } from 'lucide-react'
import { useGetProjectsQuery } from '@/store/api/projectApi'
import { useRouter } from 'next/navigation'

interface ProjectSelectorDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelectProject: (projectId: string) => void
  defaultUrl?: string
}

export function ProjectSelectorDialog({ isOpen, onClose, onSelectProject, defaultUrl }: ProjectSelectorDialogProps) {
  const router = useRouter()
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [isAnimating, setIsAnimating] = useState(false)
  const { data: projectsData, isLoading } = useGetProjectsQuery()
  const projects = projectsData?.projects || []

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }

    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  // ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose()
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen])

  const handleClose = () => {
    setIsAnimating(false)
    setTimeout(() => {
      onClose()
    }, 200)
  }

  const handleSubmit = () => {
    if (selectedProjectId) {
      onSelectProject(selectedProjectId)
      handleClose()
    }
  }

  const handleCreateNewProject = () => {
    handleClose()
    setTimeout(() => {
      router.push('/dashboard/projects')
    }, 200)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200 cursor-pointer ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className={`relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden transition-all duration-200 max-h-[85vh] flex flex-col ${
        isAnimating ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"
      }`}>
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors z-10 cursor-pointer"
          aria-label="Close (ESC)"
          title="Close (ESC)"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Content */}
        <div className="p-8 overflow-y-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <FolderOpen className="h-8 w-8 text-slate-900" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              Select Project
            </h2>
            <p className="text-slate-600">
              {defaultUrl ? (
                <>Choose a project to start crawling <span className="text-slate-900 font-medium">{defaultUrl}</span></>
              ) : (
                'Choose a project to organize your crawl'
              )}
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-600">Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-12 text-center space-y-6">
              <div className="flex items-center justify-center">
                <div className="p-4 bg-slate-100 rounded-full">
                  <FolderOpen className="h-12 w-12 text-slate-400" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-slate-900 font-semibold text-lg">No projects found</p>
                <p className="text-slate-600 text-sm">Create your first project to start crawling</p>
              </div>
              <Button 
                onClick={handleCreateNewProject}
                className="w-full py-3 bg-slate-900 text-white rounded-full font-semibold hover:bg-slate-800 transition-all duration-300 hover:scale-105 shadow-lg cursor-pointer"
              >
                <Plus className="mr-2 h-5 w-5" />
                Create Your First Project
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Project List */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select a project
                </label>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full text-left px-4 py-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
                        selectedProjectId === project.id
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{project.name}</p>
                          {project.description && (
                            <p className="text-sm text-slate-500 mt-1">{project.description}</p>
                          )}
                        </div>
                        <div className="ml-4 text-right">
                          <p className="text-xs text-slate-500">
                            {project._count?.sessions || 0} sessions
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Create New Project Link */}
              <button
                onClick={handleCreateNewProject}
                className="w-full text-center text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors py-2 cursor-pointer"
              >
                <Plus className="inline-block mr-1 h-4 w-4" />
                Create New Project
              </button>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!selectedProjectId}
                className="w-full py-3 bg-slate-900 text-white rounded-full font-semibold hover:bg-slate-800 transition-all duration-300 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 cursor-pointer"
              >
                Start Crawl
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
