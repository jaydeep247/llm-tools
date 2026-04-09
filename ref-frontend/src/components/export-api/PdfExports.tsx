'use client'

import { useState } from 'react'
import { FileText, Calendar, Download, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PDF_EXPORTS = [
  {
    id: 'weekly-summary',
    label: 'Weekly Summary',
    description: 'Top-level performance overview with key metrics and movement.',
    endpoint: '/export/pdf/weekly-summary',
  },
  {
    id: 'audit-report',
    label: 'Audit Report',
    description: 'Full technical, content, and schema audit findings.',
    endpoint: '/export/pdf/audit-report',
  },
  {
    id: 'competitor-report',
    label: 'Competitor Report',
    description: 'Competitive gap analysis and benchmarking snapshot.',
    endpoint: '/export/pdf/competitor-report',
  },
  {
    id: 'ai-scorecard',
    label: 'AI Visibility Scorecard',
    description: 'AI citation presence across ChatGPT, Gemini, and Perplexity.',
    endpoint: '/export/pdf/ai-scorecard',
  },
] as const

type ExportId = (typeof PDF_EXPORTS)[number]['id']

interface ExportState {
  loading: boolean
  success: boolean
}

export function PdfExports({ projectId }: { projectId?: string }) {
  const [dates, setDates] = useState<Record<ExportId, string>>(() => {
    const today = new Date().toISOString().split('T')[0]
    return Object.fromEntries(PDF_EXPORTS.map((e) => [e.id, today])) as Record<ExportId, string>
  })

  const [states, setStates] = useState<Record<ExportId, ExportState>>(() =>
    Object.fromEntries(PDF_EXPORTS.map((e) => [e.id, { loading: false, success: false }])) as Record<
      ExportId,
      ExportState
    >,
  )

  const handleDownload = async (item: (typeof PDF_EXPORTS)[number]) => {
    setStates((prev) => ({ ...prev, [item.id]: { loading: true, success: false } }))

    try {
      const date = dates[item.id]
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'
      const params = new URLSearchParams({ date })
      if (projectId) params.set('project_id', projectId)
      const url = `${base}${item.endpoint}?${params.toString()}`

      const response = await fetch(url, { credentials: 'include' })

      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `colytics-${item.id}-${date}.pdf`
      a.click()
      URL.revokeObjectURL(downloadUrl)

      setStates((prev) => ({ ...prev, [item.id]: { loading: false, success: true } }))
      toast.success('Your report is ready. Downloading now.')

      setTimeout(() => {
        setStates((prev) => ({ ...prev, [item.id]: { loading: false, success: false } }))
      }, 3000)
    } catch {
      setStates((prev) => ({ ...prev, [item.id]: { loading: false, success: false } }))
      toast.error('Failed to generate report. Please try again.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PDF_EXPORTS.map((item) => {
          const state = states[item.id]
          const isLoading = state.loading
          const isSuccess = state.success

          return (
            <div
              key={item.id}
              className={cn(
                'group relative rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5',
                'transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900',
              )}
            >
              {/* Icon */}
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">{item.label}</p>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">{item.description}</p>
                </div>
              </div>

              {/* Date picker */}
              <div className="mb-4 space-y-1.5">
                <Label className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  Report Date
                </Label>
                <Input
                  type="date"
                  value={dates[item.id]}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) =>
                    setDates((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  disabled={isLoading}
                  className="h-8 text-xs bg-zinc-800 border-zinc-700 text-white scheme-dark focus-visible:ring-amber-500/40 focus-visible:border-amber-500/40"
                />
              </div>

              {/* Download button */}
              <Button
                onClick={() => handleDownload(item)}
                disabled={isLoading || isSuccess}
                className={cn(
                  'w-full h-9 text-[12px] font-medium rounded-xl transition-all duration-200',
                  isSuccess
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10'
                    : 'bg-zinc-800 text-white hover:bg-amber-500 hover:text-black border border-zinc-700 hover:border-amber-500',
                )}
                variant="ghost"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Preparing PDF...
                  </>
                ) : isSuccess ? (
                  <>
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                    Downloaded
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Download PDF
                  </>
                )}
              </Button>

              {/* Loading hint */}
              {isLoading && (
                <p className="mt-2 text-center text-[11px] text-zinc-500">
                  Preparing your report PDF… This takes about 15 seconds.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
