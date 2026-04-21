'use client'

import { useState } from 'react'
import {
  Copy,
  RefreshCw,
  Lock,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Clock,
  Zap,
  Eye,
  EyeOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useGetApiKeyQuery, useRegenerateApiKeyMutation } from '@/store/api/exportApi'
import { Skeleton } from '@/components/ui/skeleton'

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/visibility-score',
    params: 'domain={domain}',
    description: 'AI visibility score',
  },
  {
    method: 'GET',
    path: '/api/v1/citations',
    params: 'domain={domain}&from={date}&to={date}',
    description: 'Citation mentions',
  },
  {
    method: 'GET',
    path: '/api/v1/audit-report',
    params: 'domain={domain}&crawl_id={id}&type=technical|content|schema',
    description: 'Audit findings',
  },
  {
    method: 'GET',
    path: '/api/v1/alerts',
    params: 'domain={domain}&status=active|resolved|all',
    description: 'Alert feed',
  },
  {
    method: 'GET',
    path: '/api/v1/competitors',
    params: 'domain={domain}&period=7d|30d',
    description: 'Competitor snapshot',
  },
  {
    method: 'GET',
    path: '/api/v1/prompt-tracking',
    params: 'domain={domain}&model=all|chatgpt|gemini|perplexity',
    description: 'Prompt visibility',
  },
  {
    method: 'GET',
    path: '/api/v1/weekly-report',
    params: 'domain={domain}&week={YYYY-WW}',
    description: 'Weekly summary',
  },
]

interface ApiAccessProps {
  canAccess: boolean
}

export function ApiAccess({ canAccess }: ApiAccessProps) {
  const [showKey, setShowKey] = useState(false)
  const [regenModalOpen, setRegenModalOpen] = useState(false)

  const { data, isLoading } = useGetApiKeyQuery(undefined, { skip: !canAccess })
  const [regenerate, { isLoading: isRegenerating }] = useRegenerateApiKeyMutation()

  const apiKey = data?.apiKey

  const maskedKey = apiKey
    ? showKey
      ? apiKey.key
      : apiKey.key.slice(0, 8) + '••••••••••••••••••••••••'
    : '••••••••••••••••••••••••••••••••'

  const handleCopy = () => {
    if (!apiKey) return
    navigator.clipboard.writeText(apiKey.key)
    toast.success('API key copied to clipboard.')
  }

  const handleRegenerate = async () => {
    try {
      await regenerate().unwrap()
      setRegenModalOpen(false)
      toast.success('API key regenerated. Update your integrations.')
    } catch {
      toast.error('Failed to regenerate key. Try again.')
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
          <p className="text-[14px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Agency & Enterprise only</p>
          <p className="text-[13px] max-w-sm" style={{ color: 'var(--nd-text-secondary)' }}>API access is available on Agency and Enterprise plans.</p>
        </div>
        <Button className="h-9 px-5 text-[13px] rounded-xl text-white font-semibold" style={{ background: 'var(--nd-purple)' }} asChild>
          <a href="/dashboard/subscriptions">Upgrade Plan</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Key panel ── */}
      <div className="rounded-2xl border p-5 space-y-4" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" style={{ color: 'var(--nd-purple)' }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Your API Key</span>
        </div>

        {/* Key display */}
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl border px-4 py-2.5 font-mono text-[13px] overflow-hidden" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
            {isLoading ? <Skeleton className="h-4 w-64" style={{ background: 'var(--nd-border)' }} /> : <span className="select-all">{maskedKey}</span>}
          </div>
          <Button onClick={() => setShowKey((v) => !v)} variant="ghost" size="icon" className="h-9 w-9 rounded-xl transition-colors" style={{ color: 'var(--nd-text-muted)' }} aria-label={showKey ? 'Hide API key' : 'Reveal API key'} disabled={isLoading || !apiKey}>
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button onClick={handleCopy} variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:text-[#5347CE] hover:bg-[#EEEDFC] transition-colors" style={{ color: 'var(--nd-text-muted)' }} aria-label="Copy API key" disabled={isLoading || !apiKey}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        {/* Metadata row */}
        {isLoading ? (
          <div className="flex gap-4">
            {[28, 28, 24].map((w, i) => <Skeleton key={i} className="h-3" style={{ width: `${w * 4}px`, background: 'var(--nd-border)' }} />)}
          </div>
        ) : apiKey ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {[
              { icon: Clock, text: `Created ${new Date(apiKey.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` },
              { icon: Clock, text: `Last used ${apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}` },
              { icon: Zap, text: `${apiKey.rateLimit.toLocaleString()} req/day` },
            ].map(({ icon: Icon, text }) => (
              <span key={text} className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--nd-text-muted)' }}><Icon className="h-3 w-3" />{text}</span>
            ))}
          </div>
        ) : null}

        {/* Regenerate */}
        <div className="pt-1">
          <Button onClick={() => setRegenModalOpen(true)} variant="ghost" className="h-8 px-4 text-[12px] rounded-xl text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 hover:text-red-600 transition-all duration-150" disabled={isLoading}>
          <RefreshCw className="mr-1.5 h-3 w-3" /> Regenerate Key
        </Button>
        </div>
      </div>

      {/* ── API Reference ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>REST API Reference</span>
          <a href="/docs/api" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] transition-colors hover:underline" style={{ color: 'var(--nd-purple)' }}>
            View full documentation <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="rounded-xl border px-4 py-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
          <p className="text-[11px]" style={{ color: 'var(--nd-text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Authorization: Bearer</span>{' '}
            <span className="font-mono" style={{ color: 'var(--nd-purple)' }}>{'<your-api-key>'}</span>
          </p>
        </div>

        {/* Endpoints table */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--nd-border)' }}>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium w-12" style={{ color: 'var(--nd-text-muted)' }}>Method</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium" style={{ color: 'var(--nd-text-muted)' }}>Endpoint</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium hidden sm:table-cell" style={{ color: 'var(--nd-text-muted)' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {API_ENDPOINTS.map((ep, idx) => (
                <tr key={idx} className={cn('border-b transition-colors', idx === API_ENDPOINTS.length - 1 && 'border-b-0')} style={{ borderColor: 'var(--nd-border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nd-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">{ep.method}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[13px]" style={{ color: 'var(--nd-text-primary)' }}>{ep.path}</span><br />
                    <span className="font-mono text-[10px]" style={{ color: 'var(--nd-text-muted)' }}>{ep.params}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell" style={{ color: 'var(--nd-text-secondary)' }}>{ep.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-2xl border px-4 py-4" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
          <p className="text-[11px] mb-2" style={{ color: 'var(--nd-text-muted)' }}>Response format</p>
          <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto" style={{ color: 'var(--nd-text-secondary)' }}>{`{
  "success": boolean,
  "data": {},
  "generated_at": "ISO timestamp",
  "domain": "string"
}`}</pre>
        </div>
      </div>

      {/* ── Regenerate confirmation modal ── */}
      <Dialog open={regenModalOpen} onOpenChange={setRegenModalOpen}>
        <DialogContent className="bg-white border border-[#E8E9EF] rounded-2xl max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-[15px]" style={{ color: 'var(--nd-text-primary)' }}>Regenerate API Key</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>
              Regenerating your API key will{' '}
              <span className="text-red-500 font-medium">immediately invalidate</span> your current key. Any integrations using the old key will stop working until updated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setRegenModalOpen(false)} className="h-9 rounded-xl border text-[13px] cursor-pointer" style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}>Cancel</Button>
            <Button onClick={handleRegenerate} disabled={isRegenerating} className="h-9 rounded-xl bg-red-500 text-white hover:bg-red-400 text-[13px] font-medium cursor-pointer">
              {isRegenerating ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Regenerating…</> : 'Yes, regenerate key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
