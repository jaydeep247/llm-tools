
'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'

interface StepWrapperProps {
  title: string
  description?: string
  children: React.ReactNode
  onNext: () => void
  onBack?: () => void
  canProceed: boolean
  isLastStep?: boolean
  isLoading?: boolean
  backLabel?: string
  nextLabel?: string
  currentStep?: number
  totalSteps?: number
}

export function StepWrapper({
  title,
  description,
  children,
  onNext,
  onBack,
  canProceed,
  isLastStep = false,
  isLoading = false,
  backLabel = 'Go Back',
  nextLabel = 'Continue',
  currentStep,
  totalSteps
}: StepWrapperProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-zinc-900 mb-2 tracking-tight">{title}</h2>
        {description && <p className="text-zinc-500 text-sm">{description}</p>}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
        {children}
      </div>

      <div className="mt-auto pt-6">
        {/* Navigation Buttons */}
        <div className="flex justify-between items-center mb-6">
          {onBack ? (
            <button
              onClick={onBack}
              className="text-(--nd-text-muted) hover:text-(--nd-text-primary) transition-colors flex items-center text-sm font-medium group cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              {backLabel}
            </button>
          ) : (
            <div /> // Spacer
          )}

          <Button
            onClick={onNext}
            disabled={!canProceed || isLoading}
            className="bg-(--nd-purple) text-white hover:bg-(--nd-purple-light) px-6 h-10 text-sm font-medium rounded-full transition-all shadow-lg flex items-center"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {nextLabel}
                {!isLastStep && <ArrowRight className="w-4 h-4 ml-2" />}
              </>
            )}
          </Button>
        </div>

        {/* Progress Bar - Only show if currentStep and totalSteps are provided */}
        {currentStep !== undefined && totalSteps !== undefined && (
          <div className="pt-6 border-t border-zinc-200 flex items-center justify-between">
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps }).map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx <= currentStep ? 'w-8 bg-(--nd-purple)' : 'w-1.5 bg-(--nd-border)'
                  }`}
                />
              ))}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-(--nd-text-muted) font-bold">
              Step {currentStep + 1} of {totalSteps}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
