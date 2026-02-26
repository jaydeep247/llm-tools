
'use client'

import { motion } from 'framer-motion'
import { StepWrapper } from '../step-wrapper'
import { CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

interface StepFocusProps {
  onNext: () => void
  onBack: () => void
  value: string
  onChange: (value: string) => void
  currentStep: number
  totalSteps: number
}

const FOCUS_AREAS = [
  { value: 'Technical SEO', label: 'Technical SEO' },
  { value: 'Crawling', label: 'Crawling & Indexing' },
  { value: 'AEO', label: 'AEO (Answer Engine Optimization)' },
  { value: 'Performance', label: 'Site Performance' },
  { value: 'Content Quality', label: 'Content Quality' },
  { value: 'Other', label: 'Other' },
]

export function StepFocus({ onNext, onBack, value, onChange, currentStep, totalSteps }: StepFocusProps) {
  const [isOtherSelected, setIsOtherSelected] = useState(() => {
    if (!value) return false
    return !FOCUS_AREAS.some(r => r.value === value && r.value !== 'Other')
  })

  const handleOptionClick = (optionValue: string) => {
    if (optionValue === 'Other') {
      setIsOtherSelected(true)
      onChange('')
    } else {
      setIsOtherSelected(false)
      onChange(optionValue)
    }
  }

  return (
    <StepWrapper
      title="What are you trying to improve right now?"
      description="Select your primary focus area."
      onNext={onNext}
      onBack={onBack}
      canProceed={!!value}
      nextLabel="Complete Setup"
      backLabel="Go Back"
      currentStep={currentStep}
      totalSteps={totalSteps}
    >
      <div className="grid gap-3">
        {FOCUS_AREAS.map((option) => {
          if (option.value === 'Other' && isOtherSelected) {
            return (
              <motion.div
                key={option.value}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative flex items-center p-3 rounded-lg border border-white bg-zinc-900/50 shadow-lg shadow-white/5"
              >
                <Input
                  autoFocus
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="Please specify..."
                  className="border-none bg-transparent text-white placeholder:text-zinc-500 focus-visible:ring-0 px-0 h-auto py-0 text-sm font-medium caret-white"
                />
              </motion.div>
            )
          }

          return (
            <motion.div
              key={option.value}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleOptionClick(option.value)}
              className={`
                relative flex items-center p-3 rounded-lg border cursor-pointer transition-all duration-200
                ${value === option.value 
                  ? 'bg-white text-black border-white ring-1 ring-white/20 shadow-lg shadow-white/5' 
                  : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-700'}
              `}
            >
              <div className="flex-1 font-medium text-sm">{option.label}</div>
              {value === option.value && (
                <CheckCircle2 className="w-5 h-5 text-black animate-in zoom-in duration-200" />
              )}
            </motion.div>
          )
        })}
      </div>
    </StepWrapper>
  )
}
