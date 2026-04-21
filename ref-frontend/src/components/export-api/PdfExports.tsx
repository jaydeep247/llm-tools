'use client'

import { useState } from 'react'
import { FileText, Download, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

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

type CardStatus = 'idle' | 'checking' | 'downloading' | 'success' | 'error'

interface CardState {
  status: CardStatus
  errorMessage: string
  errorHint: string
}

const defaultCardState: CardState = {
  status: 'idle',
  errorMessage: '',
  errorHint: '',
}

export function PdfExports({ projectId }: { projectId?: string }) {
  const [states, setStates] = useState<Record<ExportId, CardState>>(() =>
    Object.fromEntries(PDF_EXPORTS.map((e) => [e.id, { ...defaultCardState }])) as Record<ExportId, CardState>,
  )

  const setCardState = (id: ExportId, patch: Partial<CardState>) =>
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const handleDownload = async (item: (typeof PDF_EXPORTS)[number]) => {
    const id = item.id as ExportId
    setCardState(id, { status: 'checking', errorMessage: '', errorHint: '' })

    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

    try {
      // ── Step 1: Pre-flight readiness check ─────────────────────────────
      const checkParams = new URLSearchParams()
      if (projectId) checkParams.set('project_id', projectId)
      const checkRes = await fetch(`${base}/export/check/${item.id}?${checkParams}`, {
        credentials: 'include',
      })
      const checkJson = await checkRes.json()

      if (!checkJson?.data?.ready) {
        const msg = checkJson?.data?.message || checkJson?.message || 'Data not available for this report.'
        const hint = checkJson?.data?.hint || ''
        setCardState(id, { status: 'error', errorMessage: msg, errorHint: hint })
        return
      }

      // ── Step 2: Download ─────────────────────────────────────────────────
      setCardState(id, { status: 'downloading' })

      const dlParams = new URLSearchParams()
      if (projectId) dlParams.set('project_id', projectId)
      const response = await fetch(`${base}${item.endpoint}?${dlParams}`, { credentials: 'include' })

      if (!response.ok) {
        // Try to parse backend error for a better message
        let msg = 'Failed to generate report. Please try again.'
        let hint = ''
        try {
          const errJson = await response.json()
          msg = errJson?.message || msg
          hint = errJson?.hint || ''
        } catch { /* ignore */ }
        setCardState(id, { status: 'error', errorMessage: msg, errorHint: hint })
        return
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `colytics-${item.id}-${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      URL.revokeObjectURL(downloadUrl)

      setCardState(id, { status: 'success' })
      toast.success('Your report is ready. Downloading now.')

      setTimeout(() => setCardState(id, { ...defaultCardState }), 3500)
    } catch {
      setCardState(id, {
        status: 'error',
        errorMessage: 'Network error. Please check your connection and try again.',
        errorHint: '',
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PDF_EXPORTS.map((item) => {
          const state = states[item.id as ExportId]
          const isChecking = state.status === 'checking'
          const isDownloading = state.status === 'downloading'
          const isBusy = isChecking || isDownloading
          const isSuccess = state.status === 'success'
          const isError = state.status === 'error'

          return (
            <div
              key={item.id}
              className={cn('group relative rounded-2xl border p-5 transition-all duration-200', isError ? 'border-amber-300' : '')}
              style={{
                background: isError ? '#FFFBEB' : 'var(--nd-bg)',
                borderColor: isError ? '#FCD34D' : 'var(--nd-border)',
              }}
              onMouseEnter={(e) => { if (!isError) e.currentTarget.style.borderColor = 'var(--nd-border-hover)' }}
              onMouseLeave={(e) => { if (!isError) e.currentTarget.style.borderColor = 'var(--nd-border)' }}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--nd-purple-subtle)' }}>
                  <FileText className="h-4 w-4" style={{ color: 'var(--nd-purple)' }} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{item.label}</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>{item.description}</p>
                </div>
              </div>

              {isError && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[12px] font-medium text-amber-700">{state.errorMessage}</p>
                  </div>
                  {state.errorHint && (<p className="text-[11px] text-amber-600 pl-5">{state.errorHint}</p>)}
                </div>
              )}

              <Button
                onClick={() => handleDownload(item)}
                disabled={isBusy || isSuccess}
                className={cn(
                  'w-full h-9 text-[12px] font-medium rounded-xl transition-all duration-200 border cursor-pointer',
                  isSuccess ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                  : isError ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-[#5347CE] hover:text-white hover:border-[#5347CE]'
                  : 'text-white border-transparent hover:border-[#5347CE]',
                )}
                style={!isSuccess && !isError ? { background: 'var(--nd-purple)' } : {}}
                variant="ghost"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Checking…
                  </>
                ) : isDownloading ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Preparing PDF…
                  </>
                ) : isSuccess ? (
                  <>
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                    Downloaded
                  </>
                ) : isError ? (
                  <>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Retry
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Download PDF
                  </>
                )}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
