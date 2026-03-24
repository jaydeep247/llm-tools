'use client'

import { motion } from 'framer-motion'
import { Sparkles, Globe, Loader2, ArrowRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface StepBrandReadyProps {
  brandName: string
  brandDescription: string
  url: string
  onStart: () => void
  onSkip: () => void
  isLoading: boolean
  isDescriptionLoading?: boolean
  currentStep: number
  totalSteps: number
}

export function StepBrandReady({
  brandName,
  brandDescription,
  url,
  onStart,
  onSkip,
  isLoading,
  isDescriptionLoading = false,
  currentStep,
  totalSteps,
}: StepBrandReadyProps) {
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
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 mb-2 tracking-tight">You're all set!</h2>
        <p className="text-zinc-500 text-sm">
          Your analysis is running in the background. Review your brand profile below.
        </p>
      </div>

      {/* Summary */}
      <div className="flex-1 space-y-3">
        {/* Brand name */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white border border-zinc-200 shadow-sm">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100 shrink-0 mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Brand</p>
            <p className="text-sm text-zinc-900 font-medium truncate">{brandName || '—'}</p>
          </div>
        </div>

        {/* Brand description */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white border border-zinc-200 shadow-sm">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100 shrink-0 mt-0.5">
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">
              AI-Generated Description
            </p>
            {isDescriptionLoading ? (
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                <span className="text-sm text-zinc-400">Generating description from your website…</span>
              </div>
            ) : brandDescription ? (
              <p className="text-sm text-zinc-700 leading-relaxed">{brandDescription}</p>
            ) : (
              <p className="text-sm text-zinc-400 italic">Description will be available shortly.</p>
            )}
          </div>
        </div>

        {/* URL */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white border border-zinc-200 shadow-sm">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100 shrink-0 mt-0.5">
            <Globe className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Analysing</p>
            <p className="text-sm text-zinc-900 font-medium truncate">{url || '—'}</p>
          </div>
        </div>

        {/* Running indicator */}
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-zinc-700 text-xs font-medium">Quick-start analysis is running in the background</p>
          </div>
          <p className="text-zinc-500 text-xs mt-1 ml-4">
            You can view progress on the next page. Results are typically ready in a few minutes.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-6">
        <div className="flex justify-between items-center mb-6">
          <Button
            onClick={onSkip}
            variant="ghost"
            disabled={isLoading}
            className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 px-4 h-10 text-sm font-medium rounded-full"
          >
            Skip to Dashboard
          </Button>

          <Button
            onClick={onStart}
            disabled={isLoading}
            className="bg-zinc-900 text-white hover:bg-zinc-700 px-6 h-10 text-sm font-medium rounded-full transition-all shadow-lg shadow-zinc-200 flex items-center"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                View Progress
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
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
