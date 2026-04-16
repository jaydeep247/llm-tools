'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tag, Plus, X, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface StepBrandKeywordsProps {
  keywords: string[]
  onKeywordsChange: (v: string[]) => void
  onNext: () => void
  onBack: () => void
  currentStep: number
  totalSteps: number
}

const MAX_KEYWORDS = 10

export function StepBrandKeywords({
  keywords,
  onKeywordsChange,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: StepBrandKeywordsProps) {
  const [inputValue, setInputValue] = useState('')

  const addKeyword = () => {
    const trimmed = inputValue.trim().toLowerCase()
    if (!trimmed || keywords.includes(trimmed) || keywords.length >= MAX_KEYWORDS) return
    onKeywordsChange([...keywords, trimmed])
    setInputValue('')
  }

  const removeKeyword = (index: number) => {
    onKeywordsChange(keywords.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addKeyword()
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
        <h2 className="text-xl font-bold text-brand-charcoal mb-1.5 tracking-tight">Brand keywords</h2>
        <p className="text-brand-muted text-sm">
          Add up to {MAX_KEYWORDS} keywords or phrases associated with your brand. This step is optional.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="e.g. brand awareness"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={keywords.length >= MAX_KEYWORDS}
            className="bg-white! border-brand-warm! text-brand-charcoal! placeholder:text-brand-muted! focus-visible:ring-2! focus-visible:ring-brand-orange/20! focus-visible:border-brand-orange! h-11 flex-1 rounded-xl! shadow-none!"
          />
          <Button
            onClick={addKeyword}
            disabled={!inputValue.trim() || keywords.length >= MAX_KEYWORDS}
            size="sm"
            className="h-11 px-4 bg-brand-orange text-white hover:bg-brand-orange-hover rounded-xl text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Keyword chips */}
        <div className="flex flex-wrap gap-2 min-h-15">
          <AnimatePresence>
            {keywords.map((kw, idx) => (
              <motion.span
                key={kw}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-orange-subtle border border-brand-orange-light text-brand-charcoal text-sm font-medium"
              >
                {kw}
                <button
                  onClick={() => removeKeyword(idx)}
                  className="text-brand-muted hover:text-brand-charcoal transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>

          {keywords.length === 0 && (
            <p className="text-brand-muted text-xs italic self-center">No keywords added yet. You can skip this step.</p>
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
