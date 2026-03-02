'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Play, Loader2, Globe } from 'lucide-react'

interface StepStartSessionProps {
  onStart: (url: string) => Promise<void>
  onSkip: () => void
  onBack: () => void
  isLoading: boolean
  currentStep: number
  totalSteps: number
}

export function StepStartSession({
  onStart,
  onSkip,
  onBack,
  isLoading,
  currentStep,
  totalSteps,
}: StepStartSessionProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleStart = async () => {
    if (!url.trim()) {
      setError('Please enter a URL to analyze')
      return
    }
    setError(null)
    await onStart(url.trim())
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
          <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
            <Play className="w-4 h-4 text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Start your first session</h2>
        <p className="text-zinc-400 text-sm">
          Enter the URL you want to analyze. We'll run a quick audit and show you the results.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="onb-session-url" className="text-zinc-300 text-sm font-medium">
            Website URL
          </Label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <Input
              id="onb-session-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-white/20 focus-visible:border-white/30 h-11 pl-9"
            />
          </div>
          {error && (
            <p className="text-red-400 text-xs mt-1">{error}</p>
          )}
        </div>

        <div className="p-4 rounded-xl bg-white/3 border border-white/5">
          <p className="text-zinc-400 text-xs leading-relaxed">
            We'll run a <span className="text-white font-medium">quick-start analysis</span> covering brand presence,
            competitor mentions, and AI share of voice. Results are ready in minutes.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-6">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={onBack}
            className="text-zinc-400 hover:text-white transition-colors flex items-center text-sm font-medium group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Go Back
          </button>

          <div className="flex items-center gap-3">
            <Button
              onClick={onSkip}
              variant="ghost"
              disabled={isLoading}
              className="text-zinc-500 hover:text-white hover:bg-white/5 px-4 h-10 text-sm font-medium rounded-full"
            >
              Skip
            </Button>

            <Button
              onClick={handleStart}
              disabled={!url.trim() || isLoading}
              className="bg-zinc-200 text-black hover:bg-white px-6 h-10 text-sm font-medium rounded-full transition-all shadow-lg shadow-white/5 flex items-center"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Session
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="pt-6 border-t border-zinc-900 flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx <= currentStep ? 'w-8 bg-white' : 'w-1.5 bg-zinc-800'
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
