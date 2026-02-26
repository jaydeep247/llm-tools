
'use client'

import { motion } from 'framer-motion'
import { StepWrapper } from '../step-wrapper'
import { CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

interface StepRoleProps {
  onNext: () => void
  onBack: () => void
  value: string
  onChange: (value: string) => void
  currentStep: number
  totalSteps: number
}

const ROLES = [
  { value: 'Founder', label: 'Founder' },
  { value: 'SEO', label: 'SEO Professional' },
  { value: 'Developer', label: 'Developer' },
  { value: 'Agency', label: 'Agency' },
  { value: 'Content Marketer', label: 'Content Marketer' },
  { value: 'Other', label: 'Other' },
]

export function StepRole({ onNext, onBack, value, onChange, currentStep, totalSteps }: StepRoleProps) {
  const [isOtherSelected, setIsOtherSelected] = useState(() => {
    if (!value) return false
    return !ROLES.some(r => r.value === value && r.value !== 'Other')
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
      title="Who are you?"
      description="Help us tailor the experience to your role."
      onNext={onNext}
      onBack={onBack}
      canProceed={!!value}
      nextLabel="Continue"
      backLabel="Go Back"
      currentStep={currentStep}
      totalSteps={totalSteps}
    >
      <div className="grid gap-3">
        {ROLES.map((option) => {
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
