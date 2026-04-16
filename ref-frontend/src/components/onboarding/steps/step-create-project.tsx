'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'

interface StepCreateProjectProps {
  onAdd: (name: string, description?: string) => Promise<void>
  onSkip: () => void
  onBack?: () => void
  isLoading: boolean
  currentStep: number
  totalSteps: number
  name: string
  description: string
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  projectAlreadyCreated?: boolean
}

export function StepCreateProject({
  onAdd,
  onSkip,
  onBack,
  isLoading,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  projectAlreadyCreated = false,
}: StepCreateProjectProps) {
  const handleAdd = async () => {
    if (!projectAlreadyCreated && !name.trim()) return
    await onAdd(name.trim(), description.trim() || undefined)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-brand-charcoal mb-1.5 tracking-tight">
          Create your first project
        </h2>
        <p className="text-brand-muted text-sm">
          Projects help you organise sessions and track progress over time.
        </p>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="onb-project-name" className="text-brand-charcoal text-sm font-medium">
            Project Name
          </Label>
          <Input
            id="onb-project-name"
            placeholder="Enter your project name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="h-11 bg-white! border-brand-warm! text-brand-charcoal! placeholder:text-brand-muted! rounded-xl! focus-visible:border-brand-orange! focus-visible:ring-2! focus-visible:ring-brand-orange/20! shadow-none!"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="onb-project-desc" className="text-brand-charcoal text-sm font-medium">
            Description <span className="text-brand-muted font-normal">(optional)</span>
          </Label>
          <Textarea
            id="onb-project-desc"
            placeholder="What are you analyzing?"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
            className="bg-white! border-brand-warm! text-brand-charcoal! placeholder:text-brand-muted! rounded-xl! focus-visible:border-brand-orange! focus-visible:ring-2! focus-visible:ring-brand-orange/20! resize-none min-h-20 shadow-none!"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 mt-auto pt-5 border-t border-brand-warm/30">
        <button
          onClick={onSkip}
          disabled={isLoading}
          className="text-brand-muted hover:text-brand-charcoal px-4 h-10 text-sm font-medium rounded-xl cursor-pointer transition-colors disabled:opacity-40"
        >
          Skip
        </button>
        <Button
          onClick={handleAdd}
          disabled={(!projectAlreadyCreated && !name.trim()) || isLoading}
          className="bg-brand-orange text-white hover:bg-brand-orange-hover px-6 h-10 text-sm font-semibold rounded-full transition-all cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating…
            </>
          ) : projectAlreadyCreated ? (
            <>
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          ) : (
            <>
              Create Project
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  )
}
