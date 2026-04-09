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
          <Label className="text-[12px] text-zinc-400 flex items-center gap-1.5">
            <TableIcon className="h-3 w-3" />
            Data Type
          </Label>
          <Select
            value={dataType}
            onValueChange={(v) => { setDataType(v); setError(null); setStatus('idle') }}
            disabled={isBusy}
          >
            <SelectTrigger className="h-9 text-xs bg-zinc-800 border-zinc-700 text-white focus:ring-amber-500/40 focus:border-amber-500/40 rounded-xl">
              <SelectValue placeholder="Select data type" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
              {DATA_TYPES.map((d) => (
                <SelectItem
                  key={d.value}
                  value={d.value}
                  className="text-xs focus:bg-zinc-800 focus:text-white"
                >
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date from */}
        <div className="space-y-1.5">
          <Label className="text-[12px] text-zinc-400 flex items-center gap-1.5">
            <CalendarRange className="h-3 w-3" />
            From
          </Label>
          <Input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            disabled={isBusy}
            className="h-9 text-xs bg-zinc-800 border-zinc-700 text-white scheme-dark focus-visible:ring-amber-500/40 focus-visible:border-amber-500/40 rounded-xl"
          />
        </div>

        {/* Date to */}
        <div className="space-y-1.5">
          <Label className="text-[12px] text-zinc-400 flex items-center gap-1.5">
            <CalendarRange className="h-3 w-3" />
            To
          </Label>
          <Input
            type="date"
            value={toDate}
            min={fromDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => setToDate(e.target.value)}
            disabled={isBusy}
            className="h-9 text-xs bg-zinc-800 border-zinc-700 text-white scheme-dark focus-visible:ring-amber-500/40 focus-visible:border-amber-500/40 rounded-xl"
          />
        </div>
      </div>

      {/* Error banner */}
      {status === 'error' && error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[12px] font-medium text-amber-300">{error.message}</p>
          </div>
          {error.hint && (
            <p className="text-[11px] text-amber-400/80 pl-5">{error.hint}</p>
          )}
        </div>
      )}

      {/* Info row */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Exported files include clean headers, a{' '}
          <span className="text-zinc-300">timestamp</span> column, and a mandatory{' '}
          <span className="text-zinc-300">domain identifier</span> column for multi-domain setups.
        </p>
      </div>

      {/* Download button */}
      <Button
        onClick={handleDownload}
        disabled={isBusy}
        className="h-10 px-6 text-[13px] font-medium rounded-xl bg-zinc-800 text-white border border-zinc-700 hover:bg-amber-500 hover:text-black hover:border-amber-500 transition-all duration-200"
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
