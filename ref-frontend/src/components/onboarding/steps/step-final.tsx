
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
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full text-center p-8"
    >
      <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20 shadow-xl shadow-green-500/10">
        <CheckCircle2 className="w-8 h-8 text-green-500" />
      </div>
      
      <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
        You're All Set!
      </h1>
      
      <p className="text-zinc-400 text-base leading-relaxed max-w-sm mb-8">
        Your profile has been successfully updated. Now it's time to create your first project and start analyzing.
      </p>

      <Button
        onClick={onComplete}
        disabled={isLoading}
        className="bg-white text-black hover:bg-zinc-200 px-8 h-12 text-base font-medium rounded-xl transition-all shadow-lg shadow-white/10 w-full max-w-xs"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Creating Account...
          </>
        ) : (
          <>
            Create First Project <ArrowRight className="ml-2 w-5 h-5" />
          </>
        )}
      </Button>
    </motion.div>
  )
}
