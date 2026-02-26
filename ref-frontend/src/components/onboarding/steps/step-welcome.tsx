
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
      <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-green-500/20 rounded-2xl flex items-center justify-center mb-6 border border-white/10 shadow-xl shadow-emerald-500/10">
        <Rocket className="w-8 h-8 text-white" />
      </div>
      
      <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
        Welcome to Contentlytics
      </h1>
      
      <p className="text-zinc-400 text-base leading-relaxed max-w-sm mb-8">
        We're excited to have you on board. Let's set up your profile to personalize your experience and help you get the most out of our tools.
      </p>

      <Button
        onClick={onNext}
        className="bg-white text-black hover:bg-zinc-200 px-8 h-12 text-base font-medium rounded-xl transition-all shadow-lg shadow-white/10 w-full max-w-xs"
      >
        Get Started
      </Button>
    </motion.div>
  )
}
