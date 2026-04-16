
'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

interface StepWelcomeProps {
  onNext: () => void
}

export function StepWelcome({ onNext }: StepWelcomeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center text-center py-2"
    >
      <h1 className="text-2xl font-bold text-brand-charcoal mb-2.5 tracking-tight">
        Welcome to Contentlytics
      </h1>

      <p className="text-brand-muted text-sm leading-relaxed max-w-xs mb-8">
        Let&apos;s set up your workspace in a few quick steps. We&apos;ll personalise
        everything to help you get the most from our tools.
      </p>

      <Button
        onClick={onNext}
        className="bg-brand-orange text-white hover:bg-brand-orange-hover px-8 h-11 text-sm font-semibold rounded-xl transition-all w-full max-w-xs cursor-pointer"
      >
        Get Started
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </motion.div>
  )
}
