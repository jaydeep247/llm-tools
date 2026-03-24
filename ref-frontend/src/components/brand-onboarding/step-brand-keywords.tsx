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
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
            <Tag className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 mb-2 tracking-tight">Brand keywords</h2>
        <p className="text-zinc-500 text-sm">
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
            className="bg-white border-zinc-300 shadow-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 h-10 flex-1"
          />
          <Button
            onClick={addKeyword}
            disabled={!inputValue.trim() || keywords.length >= MAX_KEYWORDS}
            variant="outline"
            size="sm"
            className="h-10 px-3 border-zinc-300 bg-white shadow-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-700 text-sm font-medium"
              >
                {kw}
                <button
                  onClick={() => removeKeyword(idx)}
                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>

          {keywords.length === 0 && (
            <p className="text-zinc-600 text-xs italic self-center">No keywords added yet. You can skip this step.</p>
          )}
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
