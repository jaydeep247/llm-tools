'use client'

import { Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AnalysisEmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  onRunAnalysis?: () => void
  isAnalyzing?: boolean
  disabled?: boolean
  buttonLabel?: string
  className?: string
}

export function AnalysisEmptyState({
  icon,
  title,
  description,
  onRunAnalysis,
  isAnalyzing = false,
  disabled = false,
  buttonLabel = 'Run AI Visibility Analysis',
  className,
}: AnalysisEmptyStateProps) {
  return (
    <div
      className={cn(
        'bg-zinc-800/50 rounded-2xl border border-zinc-800 p-12 text-center',
        className
      )}
    >
      <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">{description}</p>
      {onRunAnalysis && (
        <Button
          onClick={onRunAnalysis}
          disabled={disabled || isAnalyzing}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Running Analysis...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              {buttonLabel}
            </>
          )}
        </Button>
      )}
    </div>
  )
}
