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
        'bg-(--nd-card-bg) rounded-2xl border border-(--nd-border) p-12 text-center',
        className
      )}
    >
      <div className="w-16 h-16 bg-(--nd-bg) rounded-2xl flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-(--nd-text-primary) mb-2">{title}</h3>
      <p className="text-sm font-medium text-(--nd-text-secondary) mb-6 max-w-md mx-auto">{description}</p>
      {onRunAnalysis && (
        <Button
          onClick={onRunAnalysis}
          disabled={disabled || isAnalyzing}
          className="bg-(--nd-purple) hover:opacity-90 text-white"
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
