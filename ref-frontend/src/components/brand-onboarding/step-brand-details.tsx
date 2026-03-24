'use client'

import { motion } from 'framer-motion'
import { Building2, ArrowLeft, ArrowRight, FileText, Loader2 } from 'lucide-react'
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
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
            <Building2 className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 mb-2 tracking-tight">Tell us about your brand</h2>
        <p className="text-zinc-500 text-sm">
          This helps us personalise your analysis and track brand mentions accurately.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="brand-name" className="text-zinc-700 text-sm font-medium">
            Brand / Company Name
          </Label>
          <Input
            id="brand-name"
            placeholder="e.g. Acme Corp"
            value={brandName}
            onChange={(e) => onBrandNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && brandName.trim() && onNext()}
            className="bg-white border-zinc-300 shadow-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 h-11"
          />
        </div>

        {/* AI-generated brand description */}
        <div className="space-y-2">
          <Label htmlFor="brand-description" className="text-zinc-700 text-sm font-medium flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            Brand Description
            {isDescriptionLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-normal">
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
            className="bg-white border-zinc-300 shadow-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 resize-none text-sm disabled:opacity-60"
          />
          {brandDescription && !isDescriptionLoading && (
            <p className="text-[11px] text-zinc-400">Auto-generated from your website. Feel free to edit.</p>
          )}
        </div>

        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
          <p className="text-zinc-500 text-xs leading-relaxed">
            We use your brand name to monitor{' '}
            <span className="text-zinc-900 font-medium">brand mentions, AI share of voice</span>, and
            competitor comparisons across the web.
          </p>
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

          <Button
            onClick={onNext}
            disabled={!brandName.trim()}
            className="bg-zinc-900 text-white hover:bg-zinc-700 px-6 h-10 text-sm font-medium rounded-full transition-all shadow-lg shadow-zinc-200 flex items-center"
          >
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Progress */}
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
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            Step {currentStep + 1} of {totalSteps}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
