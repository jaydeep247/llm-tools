'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { BarChart3, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface StepConnectAnalyticsProps {
  onConnect: () => void
  onSkip: () => void
  onBack: () => void
  /** If set, shows a success or error banner from a previous OAuth attempt */
  gaStatus?: 'connected' | 'error'
  gaError?: string
  currentStep: number
  totalSteps: number
}

export function StepConnectAnalytics({
  onConnect,
  onSkip,
  onBack,
  gaStatus,
  gaError,
  currentStep,
  totalSteps,
}: StepConnectAnalyticsProps) {
  const [isRedirecting, setIsRedirecting] = useState(false)

  const handleConnect = () => {
    setIsRedirecting(true)
    onConnect()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 mb-2 tracking-tight">
          Connect Google Analytics
        </h2>
        <p className="text-zinc-500 text-sm">
          Connect your Google Analytics account to get traffic insights, performance tracking, and
          AI-powered recommendations.
        </p>
      </div>

      {/* Status banners */}
      {gaStatus === 'connected' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 mb-4"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-emerald-700 text-sm font-medium">
            Google Analytics connected successfully!
          </p>
        </motion.div>
      )}

      {gaStatus === 'error' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 mb-4"
        >
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-red-600 text-sm">
            {gaError === 'access_denied'
              ? 'Permission denied. You can skip this step and connect later.'
              : 'Connection failed. Please try again.'}
          </p>
        </motion.div>
      )}

      {/* Feature list */}
      <div className="flex-1 space-y-3">
        {[
          { label: 'Traffic insights', desc: 'Sessions, bounce rate, and user behaviour' },
          { label: 'Performance tracking', desc: 'Monitor growth trends over time' },
          { label: 'AI recommendations', desc: 'Personalised suggestions based on your data' },
        ].map(({ label, desc }) => (
          <div
            key={label}
            className="flex items-start gap-3 p-4 rounded-xl bg-zinc-50 border border-zinc-100"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
            <div>
              <p className="text-zinc-900 text-sm font-medium">{label}</p>
              <p className="text-zinc-500 text-xs mt-0.5">{desc}</p>
            </div>
          </div>
        ))}

        <p className="text-zinc-400 text-xs pt-1">
          Read-only access only. We never modify your Analytics data.
        </p>
      </div>

      {/* Step progress dots */}
      <div className="flex justify-center gap-1.5 my-4">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i === currentStep
                ? 'w-4 h-1.5 bg-zinc-900'
                : i < currentStep
                ? 'w-1.5 h-1.5 bg-zinc-900/40'
                : 'w-1.5 h-1.5 bg-zinc-200'
            }`}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto pt-2">
        <div className="flex justify-between items-center">
          <button
            onClick={onBack}
            disabled={isRedirecting}
            className="text-zinc-400 hover:text-zinc-700 transition-colors flex items-center text-sm font-medium group cursor-pointer disabled:opacity-40"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Go Back
          </button>

          <div className="flex items-center gap-3">
            <Button
              onClick={onSkip}
              variant="ghost"
              disabled={isRedirecting || gaStatus === 'connected'}
              className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 px-4 h-10 text-sm font-medium rounded-full"
            >
              Skip for now
            </Button>

            <Button
              onClick={gaStatus === 'connected' ? onSkip : handleConnect}
              disabled={isRedirecting}
              className="bg-zinc-900 text-white hover:bg-zinc-700 px-6 h-10 text-sm font-medium rounded-full transition-all shadow-lg shadow-zinc-900/10 flex items-center gap-2"
            >
              {isRedirecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Redirecting…</span>
                </>
              ) : gaStatus === 'connected' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Continue</span>
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4" />
                  <span>Connect Google Analytics</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
