'use client'

import { useState } from 'react'
import { Mail, Clock, Lock, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSaveScheduleMutation } from '@/store/api/exportApi'

const REPORT_TYPES = [
  { value: 'weekly-summary', label: 'Weekly Summary' },
  { value: 'audit-report', label: 'Audit Report' },
  { value: 'ai-scorecard', label: 'AI Visibility Scorecard' },
  { value: 'competitor-report', label: 'Competitor Report' },
]

const DAYS_OF_WEEK = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
]

const HOURS = Array.from({ length: 12 }, (_, i) => {
  const h = i + 6 // 6 AM – 5 PM
  const label = h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`
  return { value: String(h), label }
})

interface ScheduledExportsProps {
  canAccess: boolean
}

export function ScheduledExports({ canAccess }: ScheduledExportsProps) {
  const [email, setEmail] = useState('')
  const [reportType, setReportType] = useState('weekly-summary')
  const [day, setDay] = useState('1')
  const [hour, setHour] = useState('8')
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [emailError, setEmailError] = useState('')

  const [saveSchedule, { isLoading }] = useSaveScheduleMutation()

  const dayLabel = DAYS_OF_WEEK.find((d) => d.value === day)?.label ?? 'Monday'
  const hourLabel = HOURS.find((h) => h.value === hour)?.label ?? '8:00 AM'

  const validateEmail = (value: string) => {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    setEmailError(ok || !value ? '' : 'Please enter a valid email address.')
    return ok
  }

  const handleSave = async () => {
    if (!validateEmail(email)) return
    if (!email) {
      setEmailError('Email is required.')
      return
    }

    try {
      await saveSchedule({
        email,
        frequency: 'weekly',
        reportType,
        dayOfWeek: Number(day),
        hour: Number(hour),
      }).unwrap()

      setConfirmation(`Your weekly report will be sent to ${email} every ${dayLabel} at ${hourLabel}.`)
      toast.success('Schedule saved successfully.')
    } catch {
      toast.error('Failed to save schedule. Please try again.')
    }
  }

  /* ── Plan gate ── */
  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border" style={{ background: 'var(--nd-purple-subtle)', borderColor: 'var(--nd-border)' }}>
          <Lock className="h-6 w-6" style={{ color: 'var(--nd-purple)' }} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[14px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Agency+ plan required</p>
          <p className="text-[13px] max-w-sm" style={{ color: 'var(--nd-text-secondary)' }}>Scheduled exports are available on Agency and Enterprise plans.</p>
        </div>
        <Button className="h-9 px-5 text-[13px] rounded-xl text-white font-semibold" style={{ background: 'var(--nd-purple)' }} asChild>
          <a href="/dashboard/subscriptions">Upgrade Plan</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Success confirmation */}
      {confirmation && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-[13px] text-emerald-700">{confirmation}</p>
        </div>
      )}

      {/* Form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Email */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--nd-text-secondary)' }}>
            <Mail className="h-3 w-3" />
            Delivery Email
          </Label>
          <Input
            type="email" placeholder="you@company.com" value={email}
            onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value) }}
            onBlur={() => validateEmail(email)}
            disabled={isLoading}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? 'email-error' : undefined}
            className={cn('h-9 text-xs rounded-xl', emailError && 'border-red-400')}
            style={{ background: 'var(--nd-bg)', borderColor: emailError ? undefined : 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
          />
          {emailError && (<p id="email-error" className="text-[11px] text-red-500">{emailError}</p>)}
        </div>

        {/* Report type */}
        <div className="space-y-1.5">
          <Label className="text-[12px]" style={{ color: 'var(--nd-text-secondary)' }}>Report Type</Label>
          <Select value={reportType} onValueChange={setReportType} disabled={isLoading}>
            <SelectTrigger className="h-9 text-xs rounded-xl" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border border-[#E8E9EF] rounded-xl">
              {REPORT_TYPES.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs cursor-pointer">{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Frequency (static) */}
        <div className="space-y-1.5">
          <Label className="text-[12px]" style={{ color: 'var(--nd-text-secondary)' }}>Frequency</Label>
          <div className="flex h-9 items-center rounded-xl border px-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
            <span className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>Weekly</span>
          </div>
        </div>

        {/* Day */}
        <div className="space-y-1.5">
          <Label className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--nd-text-secondary)' }}>
            <Clock className="h-3 w-3" />
            Day of Week
          </Label>
          <Select value={day} onValueChange={setDay} disabled={isLoading}>
            <SelectTrigger className="h-9 text-xs rounded-xl" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border border-[#E8E9EF] rounded-xl">
              {DAYS_OF_WEEK.map((d) => (
                <SelectItem key={d.value} value={d.value} className="text-xs cursor-pointer">{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time */}
        <div className="space-y-1.5">
          <Label className="text-[12px]" style={{ color: 'var(--nd-text-secondary)' }}>Send Time</Label>
          <Select value={hour} onValueChange={setHour} disabled={isLoading}>
            <SelectTrigger className="h-9 text-xs rounded-xl" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border border-[#E8E9EF] rounded-xl">
              {HOURS.map((h) => (
                <SelectItem key={h.value} value={h.value} className="text-xs cursor-pointer">{h.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preview label */}
      <p className="text-[12px]" style={{ color: 'var(--nd-text-secondary)' }}>
        Preview:{' '}
        <span style={{ color: 'var(--nd-text-primary)' }}>Sent every {dayLabel} at {hourLabel}{email ? ` → ${email}` : ''}</span>
      </p>

      <Button onClick={handleSave} disabled={isLoading}
        className="h-10 px-6 text-[13px] font-medium rounded-xl text-white transition-all duration-200 cursor-pointer"
        style={{ background: 'var(--nd-purple)' }}
        variant="ghost"
      >
        {isLoading ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Saving…</> : 'Save Schedule'}
      </Button>
    </div>
  )
}
