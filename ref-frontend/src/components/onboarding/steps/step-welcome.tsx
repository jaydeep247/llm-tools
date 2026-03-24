
'use client'

import { Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

interface StepWelcomeProps {
  onNext: () => void
}

export function StepWelcome({ onNext }: StepWelcomeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full text-center p-8"
    >
      <div className="w-16 h-16 bg-linear-to-br from-emerald-500/20 to-green-500/20 rounded-2xl flex items-center justify-center mb-6 border border-emerald-200 shadow-xl shadow-emerald-500/10">
        <Rocket className="w-8 h-8 text-emerald-600" />
      </div>
      
      <h1 className="text-3xl font-bold text-zinc-900 mb-3 tracking-tight">
        Welcome to Contentlytics
      </h1>
      
      <p className="text-zinc-500 text-base leading-relaxed max-w-sm mb-8">
        We're excited to have you on board. Let's set up your profile to personalise your experience and help you get the most out of our tools.
      </p>

      <Button
        onClick={onNext}
        className="bg-zinc-900 text-white hover:bg-zinc-700 px-8 h-12 text-base font-medium rounded-xl transition-all shadow-lg shadow-zinc-900/10 w-full max-w-xs"
      >
        Get Started
      </Button>
    </motion.div>
  )
}
