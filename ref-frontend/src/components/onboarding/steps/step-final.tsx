
'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ArrowRight, Loader2 } from 'lucide-react'

interface StepFinalProps {
  onComplete: () => void
  isLoading: boolean
}

export function StepFinal({ onComplete, isLoading }: StepFinalProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full text-center py-4"
    >
      <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-5 border border-emerald-200">
        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
      </div>
      
      <h1 className="text-2xl font-bold text-brand-charcoal mb-2.5 tracking-tight">
        You&apos;re all set!
      </h1>
      
      <p className="text-brand-muted text-sm leading-relaxed max-w-xs mb-8">
        Your profile has been successfully set up. Head to your dashboard to start exploring insights.
      </p>

      <Button
        onClick={onComplete}
        disabled={isLoading}
        className="bg-brand-orange text-white hover:bg-brand-orange-hover px-8 h-11 text-sm font-semibold rounded-xl transition-all w-full max-w-xs cursor-pointer"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Setting up…
          </>
        ) : (
          <>
            Go to Dashboard <ArrowRight className="ml-2 w-4 h-4" />
          </>
        )}
      </Button>
    </motion.div>
  )
}
