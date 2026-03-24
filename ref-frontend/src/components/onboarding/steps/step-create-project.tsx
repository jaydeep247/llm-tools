'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, ArrowRight, Loader2, FolderPlus } from 'lucide-react'

interface StepCreateProjectProps {
  onAdd: (name: string, description?: string) => Promise<void>
  onSkip: () => void
  onBack: () => void
  isLoading: boolean
  currentStep: number
  totalSteps: number
}

export function StepCreateProject({
  onAdd,
  onSkip,
  onBack,
  isLoading,
  currentStep,
  totalSteps,
}: StepCreateProjectProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleAdd = async () => {
    if (!name.trim()) return
    await onAdd(name.trim(), description.trim() || undefined)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
            <FolderPlus className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 mb-2 tracking-tight">Create your first project</h2>
        <p className="text-zinc-500 text-sm">
          Give your project a name to start organising your analysis sessions.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="onb-project-name" className="text-zinc-700 text-sm font-medium">
            Project Name
          </Label>
          <Input
            id="onb-project-name"
            placeholder="My Website"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="bg-white border-zinc-300 shadow-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="onb-project-desc" className="text-zinc-700 text-sm font-medium">
            Description{' '}
            <span className="text-zinc-400 font-normal">(optional)</span>
          </Label>
          <Textarea
            id="onb-project-desc"
            placeholder="What are you analyzing?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-white border-zinc-300 shadow-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 resize-none"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-6">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={onBack}
            className="text-zinc-400 hover:text-zinc-700 transition-colors flex items-center text-sm font-medium group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Go Back
          </button>

          <div className="flex items-center gap-3">
            <Button
              onClick={onSkip}
              variant="ghost"
              disabled={isLoading}
              className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 px-4 h-10 text-sm font-medium rounded-full"
            >
              Skip
            </Button>

            <Button
              onClick={handleAdd}
              disabled={!name.trim() || isLoading}
              className="bg-zinc-900 text-white hover:bg-zinc-700 px-6 h-10 text-sm font-medium rounded-full transition-all shadow-lg shadow-zinc-900/10 flex items-center"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Create Project <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="pt-6 border-t border-zinc-200 flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx <= currentStep ? 'w-8 bg-zinc-900' : 'w-1.5 bg-zinc-200'
                }`}
              />
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
            Step {currentStep + 1} of {totalSteps}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
