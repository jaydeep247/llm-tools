'use client'

import { useState } from 'react'
import { TableIcon, Download, Loader2, CalendarRange, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DATA_TYPES = [
  { value: 'crawl-data', label: 'Crawl Data' },
  { value: 'citations', label: 'AI Citations' },
  { value: 'prompts', label: 'Prompt Tracking' },
  { value: 'competitors', label: 'Competitors' },
  { value: 'alerts', label: 'Alerts' },
]

function getDefaultDates() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

type ExportStatus = 'idle' | 'checking' | 'downloading' | 'error'

interface ErrorState {
  message: string
  hint: string
}

export function CsvExports({ projectId }: { projectId?: string }) {
  const defaults = getDefaultDates()
  const [dataType, setDataType] = useState('crawl-data')
  const [fromDate, setFromDate] = useState(defaults.from)
  const [toDate, setToDate] = useState(defaults.to)
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [error, setError] = useState<ErrorState | null>(null)

  const handleDownload = async () => {
    if (!dataType) {
      toast.error('Please select a data type.')
      return
    }
    if (fromDate > toDate) {
      toast.error('Start date must be before end date.')
      return
    }

    setError(null)
    setStatus('checking')

    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

    try {
      // ── Step 1: Pre-flight readiness check ─────────────────────────────
      const checkParams = new URLSearchParams()
      if (projectId) checkParams.set('project_id', projectId)
      const checkRes = await fetch(`${base}/export/check/${dataType}?${checkParams}`, {
        credentials: 'include',
      })
      const checkJson = await checkRes.json()

      if (!checkJson?.data?.ready) {
        const msg = checkJson?.data?.message || checkJson?.message || 'Data not available for this export.'
        const hint = checkJson?.data?.hint || ''
        setError({ message: msg, hint })
        setStatus('error')
        return
      }

      // ── Step 2: Download ─────────────────────────────────────────────────
      setStatus('downloading')

      const dlParams = new URLSearchParams({ from: fromDate, to: toDate })
      if (projectId) dlParams.set('project_id', projectId)
      const response = await fetch(`${base}/export/csv/${dataType}?${dlParams}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        let msg = 'Export failed. Please try again.'
        let hint = ''
        try {
          const errJson = await response.json()
          msg = errJson?.message || msg
          hint = errJson?.hint || ''
        } catch { /* ignore */ }
        setError({ message: msg, hint })
        setStatus('error')
        return
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `colytics-${dataType}-${fromDate}-to-${toDate}.csv`
      a.click()
      URL.revokeObjectURL(downloadUrl)

      setStatus('idle')
      toast.success('Your data export is ready. Downloading now.')
    } catch {
      setError({
        message: 'Network error. Please check your connection and try again.',
        hint: '',
      })
      setStatus('error')
    }
  }

  const isBusy = status === 'checking' || status === 'downloading'

  return (
    <div className="space-y-6">
      {/* Form grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Data type */}
        <div className="space-y-1.5">
          <Label className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--nd-text-secondary)' }}>
            <TableIcon className="h-3 w-3" />
            Data Type
          </Label>
          <Select value={dataType} onValueChange={(v) => { setDataType(v); setError(null); setStatus('idle') }} disabled={isBusy}>
            <SelectTrigger className="h-9 text-xs rounded-xl" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
              <SelectValue placeholder="Select data type" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-[#E8E9EF] rounded-xl">
              {DATA_TYPES.map((d) => (
                <SelectItem key={d.value} value={d.value} className="text-xs cursor-pointer">{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date from */}
        <div className="space-y-1.5">
          <Label className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--nd-text-secondary)' }}>
            <CalendarRange className="h-3 w-3" />
            From
          </Label>
          <Input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} disabled={isBusy}
            className="h-9 text-xs rounded-xl"
            style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
          />
        </div>

        {/* Date to */}
        <div className="space-y-1.5">
          <Label className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--nd-text-secondary)' }}>
            <CalendarRange className="h-3 w-3" />
            To
          </Label>
          <Input type="date" value={toDate} min={fromDate} max={new Date().toISOString().split('T')[0]} onChange={(e) => setToDate(e.target.value)} disabled={isBusy}
            className="h-9 text-xs rounded-xl"
            style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
          />
        </div>
      </div>

      {/* Error banner */}
      {status === 'error' && error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[12px] font-medium text-amber-700">{error.message}</p>
          </div>
          {error.hint && (<p className="text-[11px] text-amber-600 pl-5">{error.hint}</p>)}
        </div>
      )}

      {/* Info row */}
      <div className="rounded-xl border px-4 py-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>
          Exported files include clean headers, a{' '}
          <span style={{ color: 'var(--nd-text-primary)' }}>timestamp</span> column, and a mandatory{' '}
          <span style={{ color: 'var(--nd-text-primary)' }}>domain identifier</span> column for multi-domain setups.
        </p>
      </div>

      {/* Download button */}
      <Button onClick={handleDownload} disabled={isBusy}
        className="h-10 px-6 text-[13px] font-medium rounded-xl text-white border-transparent transition-all duration-200 cursor-pointer"
        style={{ background: 'var(--nd-purple)' }}
        variant="ghost"
      >
        {status === 'checking' ? (
          <>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Checking…
          </>
        ) : status === 'downloading' ? (
          <>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Generating CSV…
          </>
        ) : status === 'error' ? (
          <>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry
          </>
        ) : (
          <>
            <Download className="mr-2 h-3.5 w-3.5" />
            Download CSV
          </>
        )}
      </Button>
    </div>
  )
}
