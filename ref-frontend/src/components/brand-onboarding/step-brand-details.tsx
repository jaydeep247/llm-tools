'use client'

import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface StepBrandDetailsProps {
  brandName: string
  onBrandNameChange: (v: string) => void
  brandDescription: string
  onBrandDescriptionChange: (v: string) => void
  isDescriptionLoading: boolean
  onNext: () => void
  onBack: () => void
  currentStep: number
  totalSteps: number
}

export function StepBrandDetails({
  brandName,
  onBrandNameChange,
  brandDescription,
  onBrandDescriptionChange,
  isDescriptionLoading,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: StepBrandDetailsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-brand-charcoal mb-2 tracking-tight">Tell us about your brand</h2>
        <p className="text-brand-muted text-sm">
          This helps us personalise your analysis and track brand mentions accurately.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="brand-name" className="text-brand-charcoal text-sm font-medium">
            Brand / Company Name
          </Label>
          <Input
            id="brand-name"
            placeholder="e.g. Acme Corp"
            value={brandName}
            onChange={(e) => onBrandNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && brandName.trim() && onNext()}
            className="bg-white! border-brand-warm! text-brand-charcoal! placeholder:text-brand-muted! focus-visible:ring-2! focus-visible:ring-brand-orange/20! focus-visible:border-brand-orange! h-11 shadow-none! rounded-xl!"
          />
        </div>

        {/* AI-generated brand description */}
        <div className="space-y-2">
          <Label htmlFor="brand-description" className="text-brand-charcoal text-sm font-medium flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-brand-orange" />
            Brand Description
            {isDescriptionLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-brand-orange font-normal">
                <Loader2 className="w-3 h-3 animate-spin" />
                Generating…
              </span>
            )}
          </Label>
          <Textarea
            id="brand-description"
            placeholder={isDescriptionLoading ? 'Generating brand description from your website…' : 'A short description of your brand'}
            value={brandDescription}
            onChange={(e) => onBrandDescriptionChange(e.target.value)}
            rows={4}
            disabled={isDescriptionLoading}
            className="bg-white! border-brand-warm! text-brand-charcoal! placeholder:text-brand-muted! focus-visible:ring-2! focus-visible:ring-brand-orange/20! focus-visible:border-brand-orange! resize-none text-sm disabled:opacity-60 rounded-xl! shadow-none!"
          />
          {brandDescription && !isDescriptionLoading && (
            <p className="text-[11px] text-brand-muted">Auto-generated from your website. Feel free to edit.</p>
          )}
        </div>

        <div className="p-4 rounded-xl bg-brand-orange-subtle border border-brand-orange-light">
          <p className="text-brand-muted text-xs leading-relaxed">
            We use your brand name to monitor{' '}
            <span className="text-brand-charcoal font-medium">brand mentions, AI share of voice</span>, and
            competitor comparisons across the web.
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
            disabled={!brandName.trim()}
            className="bg-brand-orange text-white hover:bg-brand-orange-hover px-6 h-10 text-sm font-semibold rounded-full transition-all flex items-center cursor-pointer"
          >
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
