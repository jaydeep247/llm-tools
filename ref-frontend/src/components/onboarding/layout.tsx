
'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Rocket, Layers, FolderPlus } from 'lucide-react'

interface OnboardingLayoutProps {
  currentStep: number
  totalSteps: number
  children: React.ReactNode
  leftPanelContent: {
    title: string
    description: string
    testimonial?: {
      quote: string
      author: string
      role: string
      avatar?: string
    }
  }
}

export function OnboardingLayout({ 
  currentStep, 
  totalSteps, 
  children, 
  leftPanelContent 
}: OnboardingLayoutProps) {
  
  return (
    <div className="h-screen w-full bg-black overflow-hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-full flex bg-zinc-950 relative"
      >
        {/* Left Panel - Dynamic Content */}
        <div className="hidden lg:flex w-[40%] bg-gradient-to-br from-emerald-950 via-zinc-950 to-black p-8 lg:p-12 flex-col justify-between relative overflow-hidden ">
          {/* Background decoration */}
          <div className="absolute top-0 left-0 w-full h-full bg-[url('/grid.svg')] opacity-20 pointer-events-none" />
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-green-500/10 rounded-full blur-3xl" />

          {/* Branding */}
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center font-bold text-white border border-white/20 text-sm">
                C
              </div>
              <span className="font-bold text-white text-lg tracking-tight">Contentlytics</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={leftPanelContent.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
                  {leftPanelContent.title}
                </h1>
                <p className="text-zinc-400 text-base leading-relaxed max-w-sm">
                  {leftPanelContent.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Right Panel - Form Content */}
        <div className="w-full lg:w-[60%] bg-zinc-950 p-6 lg:p-24 relative flex flex-col justify-center">
          <div className="w-full max-w-lg mx-auto flex flex-col h-full justify-center">
            <div className="flex-1 flex flex-col justify-center">
              {children}
            </div>
            
            {/* Progress Bar moved to StepWrapper */}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
