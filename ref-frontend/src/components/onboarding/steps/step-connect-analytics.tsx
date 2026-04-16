'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { BarChart3, ArrowLeft, CheckCircle2, AlertCircle, Loader2, TrendingUp, Users, Lightbulb } from 'lucide-react'

interface StepConnectAnalyticsProps {
  onConnect: () => void
  onSkip: () => void
  onBack: () => void
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
}: StepConnectAnalyticsProps) {
  const [isRedirecting, setIsRedirecting] = useState(false)

  const handleConnect = () => {
    setIsRedirecting(true)
    onConnect()
  }

  const features = [
    { icon: Users, label: 'Traffic insights', desc: 'Sessions, bounce rate, and user behaviour' },
    { icon: TrendingUp, label: 'Performance tracking', desc: 'Monitor growth trends over time' },
    { icon: Lightbulb, label: 'AI recommendations', desc: 'Personalised suggestions from your data' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-brand-charcoal mb-1.5 tracking-tight">
          Connect Google Analytics
        </h2>
        <p className="text-brand-muted text-sm">
          Link your account to unlock traffic insights and AI-powered recommendations.
        </p>
      </div>

      {/* Status banners */}
      {gaStatus === 'connected' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 mb-4"
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
          className="flex items-center gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200 mb-4"
        >
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-red-600 text-sm">
            {gaError === 'access_denied'
              ? 'Permission denied. You can skip and connect later.'
              : 'Connection failed. Please try again.'}
          </p>
        </motion.div>
      )}

      {/* Feature list */}
      <div className="space-y-2.5">
        {features.map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="flex items-center gap-3.5 p-3.5 rounded-xl bg-brand-surface/60 border border-brand-warm/30"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-orange-subtle border border-brand-orange-light flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-brand-orange" />
            </div>
            <div>
              <p className="text-brand-charcoal text-sm font-medium">{label}</p>
              <p className="text-brand-muted text-xs mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-brand-muted text-xs mt-3">
        Read-only access only. We never modify your Analytics data.
      </p>

      {/* Action buttons */}
      <div className="flex items-center justify-between mt-auto pt-5 border-t border-brand-warm/30">
        <button
          onClick={onBack}
          disabled={isRedirecting}
          className="text-brand-muted hover:text-brand-charcoal transition-colors flex items-center text-sm font-medium group cursor-pointer disabled:opacity-40"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5 group-hover:-translate-x-0.5 transition-transform" />
          Back
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onSkip}
            disabled={isRedirecting || gaStatus === 'connected'}
            className="text-brand-muted hover:text-brand-charcoal px-4 h-10 text-sm font-medium rounded-xl cursor-pointer transition-colors disabled:opacity-40"
          >
            Skip for now
          </button>
          <Button
            onClick={gaStatus === 'connected' ? onSkip : handleConnect}
            disabled={isRedirecting}
            className="bg-brand-orange text-white hover:bg-brand-orange-hover px-6 h-10 text-sm font-semibold rounded-full transition-all cursor-pointer"
          >
            {isRedirecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redirecting…
              </>
            ) : gaStatus === 'connected' ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Continue
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4 mr-2" />
                Connect Analytics
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
