'use client'

import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface StepBrandDescriptionProps {
  brandDescription: string
  onBrandDescriptionChange: (v: string) => void
  isLoading: boolean
  onNext: () => void
  onBack: () => void
  currentStep: number
  totalSteps: number
}

export function StepBrandDescription({
  brandDescription,
  onBrandDescriptionChange,
  isLoading,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: StepBrandDescriptionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-brand-charcoal mb-2 tracking-tight">Your brand description</h2>
        <p className="text-brand-muted text-sm">
          We generated a description from your website. Feel free to edit it before continuing.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="brand-desc" className="text-brand-charcoal text-sm font-medium flex items-center gap-2">
            Brand Description
            {isLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-brand-orange font-normal">
                <Loader2 className="w-3 h-3 animate-spin" />
                Generating…
              </span>
            )}
          </Label>
          <Textarea
            id="brand-desc"
            placeholder={isLoading ? 'Generating brand description from your website…' : 'A short description of your brand'}
            value={brandDescription}
            onChange={(e) => onBrandDescriptionChange(e.target.value)}
            rows={5}
            disabled={isLoading}
            className="bg-white! border-brand-warm! text-brand-charcoal! placeholder:text-brand-muted! focus-visible:ring-2! focus-visible:ring-brand-orange/20! focus-visible:border-brand-orange! resize-none text-sm disabled:opacity-60 rounded-xl! shadow-none!"
          />
          {brandDescription && !isLoading && (
            <p className="text-[11px] text-brand-muted">Auto-generated from your website. Feel free to edit.</p>
          )}
        </div>

        <div className="p-4 rounded-xl bg-brand-orange-subtle border border-brand-orange-light">
          <p className="text-brand-muted text-xs leading-relaxed">
            This description helps us understand your brand and personalise your{' '}
            <span className="text-brand-charcoal font-medium">AI visibility and competitor analysis</span>.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-6">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={onBack}
            className="text-brand-muted hover:text-brand-charcoal transition-colors flex items-center text-sm font-medium group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Go Back
          </button>

          <Button
            onClick={onNext}
            disabled={isLoading}
            className="bg-brand-orange text-white hover:bg-brand-orange-hover px-6 h-10 text-sm font-semibold rounded-full transition-all flex items-center cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                Continue to Brand Setup
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {/* Progress */}
        <div className="pt-4 border-t border-brand-warm/40 flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx <= currentStep ? 'w-6 bg-brand-orange' : 'w-2 bg-brand-warm'
                }`}
              />
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-brand-muted font-bold">
            Step {currentStep + 1} of {totalSteps}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
