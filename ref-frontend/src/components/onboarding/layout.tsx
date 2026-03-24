
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
    <div className="h-screen w-full bg-white overflow-hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-full flex bg-white relative"
      >
        {/* Left Panel - Dynamic Content */}
        <div className="hidden lg:flex w-[40%] bg-emerald-600 p-8 lg:p-12 flex-col justify-between relative overflow-hidden">
          {/* Subtle texture */}
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-emerald-400/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-emerald-800/40 rounded-full blur-3xl" />

          {/* Branding */}
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-10">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-white border border-white/30 text-sm">
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
                <p className="text-emerald-100 text-base leading-relaxed max-w-sm">
                  {leftPanelContent.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom trust badge */}
          <div className="relative z-10 mt-auto">
            <div className="flex items-center gap-2 text-emerald-100/80 text-xs">
              <div className="flex -space-x-1.5">
                {['#a7f3d0','#6ee7b7','#34d399'].map((c, i) => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-emerald-600" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span>Trusted by 1,200+ marketers</span>
            </div>
          </div>
        </div>

        {/* Right Panel - Form Content */}
        <div className="w-full lg:w-[60%] bg-white p-6 lg:p-24 relative flex flex-col justify-center">
          <div className="w-full max-w-lg mx-auto flex flex-col h-full justify-center">
            <div className="flex-1 flex flex-col justify-center">
              {children}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
