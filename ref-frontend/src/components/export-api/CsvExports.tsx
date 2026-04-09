'use client'

import { useState } from 'react'
import { TableIcon, Download, Loader2, CalendarRange } from 'lucide-react'
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

export function CsvExports({ projectId }: { projectId?: string }) {
  const defaults = getDefaultDates()
  const [dataType, setDataType] = useState('crawl-data')
  const [fromDate, setFromDate] = useState(defaults.from)
  const [toDate, setToDate] = useState(defaults.to)
  const [isLoading, setIsLoading] = useState(false)

  const handleDownload = async () => {
    if (!dataType) {
      toast.error('Please select a data type.')
      return
    }
    if (fromDate > toDate) {
      toast.error('Start date must be before end date.')
      return
    }

    setIsLoading(true)

    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'
      const params = new URLSearchParams({ from: fromDate, to: toDate })
      if (projectId) params.set('project_id', projectId)
      const url = `${base}/export/csv/${dataType}?${params.toString()}`

      const response = await fetch(url, { credentials: 'include' })

      if (!response.ok) throw new Error('CSV export failed')

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `colytics-${dataType}-${fromDate}-to-${toDate}.csv`
      a.click()
      URL.revokeObjectURL(downloadUrl)

      toast.success('Your report is ready. Downloading now.')
    } catch {
      toast.error('Export failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

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
          <Select value={dataType} onValueChange={setDataType} disabled={isLoading}>
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
            disabled={isLoading}
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
            disabled={isLoading}
            className="h-9 text-xs bg-zinc-800 border-zinc-700 text-white scheme-dark focus-visible:ring-amber-500/40 focus-visible:border-amber-500/40 rounded-xl"
          />
        </div>
      </div>

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
        disabled={isLoading}
        className="h-10 px-6 text-[13px] font-medium rounded-xl bg-zinc-800 text-white border border-zinc-700 hover:bg-amber-500 hover:text-black hover:border-amber-500 transition-all duration-200"
        variant="ghost"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Generating CSV…
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
