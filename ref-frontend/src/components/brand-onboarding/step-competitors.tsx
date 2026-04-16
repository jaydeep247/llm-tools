'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Plus, X, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface StepCompetitorsProps {
  competitors: string[]
  onCompetitorsChange: (v: string[]) => void
  onNext: () => void
  onBack: () => void
  currentStep: number
  totalSteps: number
}

const MAX_COMPETITORS = 5

export function StepCompetitors({
  competitors,
  onCompetitorsChange,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: StepCompetitorsProps) {
  const [inputValue, setInputValue] = useState('')

  const addCompetitor = () => {
    const trimmed = inputValue.trim()
    if (!trimmed || competitors.includes(trimmed) || competitors.length >= MAX_COMPETITORS) return
    onCompetitorsChange([...competitors, trimmed])
    setInputValue('')
  }

  const removeCompetitor = (index: number) => {
    onCompetitorsChange(competitors.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCompetitor()
    }
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
        <h2 className="text-xl font-bold text-brand-charcoal mb-1.5 tracking-tight">Who are your competitors?</h2>
        <p className="text-brand-muted text-sm">
          Add up to {MAX_COMPETITORS} competitors — websites, brands, or domains. This step is optional.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="e.g. competitor.com"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={competitors.length >= MAX_COMPETITORS}
            className="bg-white! border-brand-warm! text-brand-charcoal! placeholder:text-brand-muted! focus-visible:ring-2! focus-visible:ring-brand-orange/20! focus-visible:border-brand-orange! h-11 flex-1 rounded-xl! shadow-none!"
          />
          <Button
            onClick={addCompetitor}
            disabled={!inputValue.trim() || competitors.length >= MAX_COMPETITORS}
            size="sm"
            className="h-11 px-4 bg-brand-orange text-white hover:bg-brand-orange-hover rounded-xl text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Competitor chips */}
        <div className="space-y-2 min-h-20">
          <AnimatePresence>
            {competitors.map((c, idx) => (
              <motion.div
                key={c}
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-brand-surface border border-brand-warm"
              >
                <span className="text-sm text-brand-charcoal font-medium">{c}</span>
                <button
                  onClick={() => removeCompetitor(idx)}
                  className="text-brand-muted hover:text-red-500 transition-colors ml-3"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {competitors.length === 0 && (
            <p className="text-brand-muted text-xs italic">No competitors added yet. You can skip this step.</p>
          )}
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
            className="bg-brand-orange text-white hover:bg-brand-orange-hover px-6 h-10 text-sm font-semibold rounded-full transition-all flex items-center"
          >
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
