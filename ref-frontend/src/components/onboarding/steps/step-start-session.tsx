'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, ArrowRight, Globe, Loader2, Sparkles } from 'lucide-react'

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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-brand-charcoal mb-1.5 tracking-tight">
          Set up your brand profile
        </h2>
        <p className="text-brand-muted text-sm">
          Enter your website URL and we&apos;ll guide you through a quick brand setup.
        </p>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="onb-session-url" className="text-brand-charcoal text-sm font-medium">
            Website URL
          </Label>
          <div className="relative">
            <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted pointer-events-none" />
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
              className="h-11 pl-10 bg-white! border-brand-warm! text-brand-charcoal! placeholder:text-brand-muted! rounded-xl! focus-visible:border-brand-orange! focus-visible:ring-2! focus-visible:ring-brand-orange/20! shadow-none!"
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>

        {/* Info card */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-brand-orange-subtle/50 border border-brand-orange-light">
          <Sparkles className="w-4 h-4 text-brand-orange mt-0.5 shrink-0" />
          <p className="text-brand-muted text-xs leading-relaxed">
            We&apos;ll run a <span className="text-brand-charcoal font-medium">quick-start analysis</span> covering
            brand presence, competitor mentions, and AI share of voice.
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between mt-auto pt-5 border-t border-brand-warm/30">
        <button
          onClick={onBack}
          className="text-brand-muted hover:text-brand-charcoal transition-colors flex items-center text-sm font-medium group cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5 group-hover:-translate-x-0.5 transition-transform" />
          Back
        </button>

        <div className="flex items-center gap-3">
          <Button
            onClick={onSkip}
            variant="ghost"
            disabled={isLoading}
            className="text-brand-muted hover:text-brand-charcoal px-4 h-10 text-sm font-medium rounded-xl cursor-pointer"
          >
            Skip
          </Button>
          <Button
            onClick={handleStart}
            disabled={!url.trim() || isLoading}
            className="bg-brand-orange text-white hover:bg-brand-orange-hover px-6 h-10 text-sm font-semibold rounded-full transition-all cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
