
'use client'

import { motion } from 'framer-motion'
import { DummyDashboard } from '@/components/shared/DummyDashboard'

interface OnboardingLayoutProps {
  currentStep: number
  totalSteps: number
  children: React.ReactNode
  /** Use 'wide' for content-heavy flows like brand-onboarding */
  size?: 'default' | 'wide'
}

export function OnboardingLayout({
  currentStep,
  totalSteps,
  children,
  size = 'default',
}: OnboardingLayoutProps) {
  const maxW = size === 'wide' ? 'max-w-5xl' : 'max-w-4xl'

  return (
    <div className="h-screen w-full bg-brand-surface relative overflow-hidden">
      {/* Light-mode dummy dashboard background */}
      <DummyDashboard />

      {/* Solid dark overlay — no blur, clean backdrop like the reference */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] z-10" />

      {/* Centered modal */}
      <div className="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className={`bg-white rounded-2xl shadow-xl ring-1 ring-black/8 w-full ${maxW} h-[min(88vh,700px)] overflow-hidden relative flex flex-col`}
        >
          {/* Progress dots — fixed height, never shifts */}
          <div className="shrink-0 flex items-center justify-center gap-1.5 pt-5 pb-3 border-b border-zinc-100/60 bg-white">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-8 bg-brand-orange'
                    : i < currentStep
                    ? 'w-4 bg-brand-orange/50'
                    : 'w-4 bg-brand-warm'
                }`}
              />
            ))}
          </div>

          {/* Step content — scrollable, scrollbar hidden */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-8 sm:px-10 pb-8 pt-5">
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
