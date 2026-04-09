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
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800 ring-1 ring-zinc-700">
          <Lock className="h-6 w-6 text-zinc-500" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[14px] font-semibold text-white">Agency & Enterprise only</p>
          <p className="text-[13px] text-zinc-500 max-w-sm">
            API access is available on Agency and Enterprise plans. Integrate Colytics directly into
            your BI stack, workflows, and custom dashboards.
          </p>
        </div>
        <Button
          className="h-9 px-5 text-[13px] rounded-xl bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
          asChild
        >
          <a href="/dashboard/subscriptions">Upgrade Plan</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Key panel ── */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-400" />
          <span className="text-[13px] font-semibold text-white">Your API Key</span>
        </div>

        {/* Key display */}
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-mono text-[13px] text-zinc-300 overflow-hidden">
            {isLoading ? (
              <Skeleton className="h-4 w-64 bg-zinc-700" />
            ) : (
              <span className="select-all">{maskedKey}</span>
            )}
          </div>
          <Button
            onClick={() => setShowKey((v) => !v)}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800"
            aria-label={showKey ? 'Hide API key' : 'Reveal API key'}
            disabled={isLoading || !apiKey}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            onClick={handleCopy}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10"
            aria-label="Copy API key"
            disabled={isLoading || !apiKey}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        {/* Metadata row */}
        {isLoading ? (
          <div className="flex gap-4">
            <Skeleton className="h-3 w-28 bg-zinc-800" />
            <Skeleton className="h-3 w-28 bg-zinc-800" />
            <Skeleton className="h-3 w-24 bg-zinc-800" />
          </div>
        ) : apiKey ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Created{' '}
              {new Date(apiKey.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Last used{' '}
              {apiKey.lastUsedAt
                ? new Date(apiKey.lastUsedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Never'}
            </span>
            <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <Zap className="h-3 w-3" />
              {apiKey.rateLimit.toLocaleString()} req/day
            </span>
          </div>
        ) : null}

        {/* Regenerate */}
        <div className="pt-1">
          <Button
            onClick={() => setRegenModalOpen(true)}
            variant="ghost"
            className="h-8 px-4 text-[12px] rounded-xl text-red-400 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30 transition-all duration-150"
            disabled={isLoading}
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Regenerate Key
          </Button>
        </div>
      </div>

      {/* ── API Reference ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white">REST API Reference</span>
          <a
            href="/docs/api"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12px] text-amber-400 hover:text-amber-300 transition-colors"
          >
            View full documentation
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Auth note */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <p className="text-[11px] text-zinc-500">
            <span className="text-zinc-300">Authorization: Bearer</span>{' '}
            <span className="font-mono text-amber-400/80">{'<your-api-key>'}</span>
          </p>
        </div>

        {/* Endpoints table */}
        <div className="rounded-2xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60">
                <th className="px-4 py-2.5 text-left text-[11px] text-zinc-500 font-medium w-12">Method</th>
                <th className="px-4 py-2.5 text-left text-[11px] text-zinc-500 font-medium">Endpoint</th>
                <th className="px-4 py-2.5 text-left text-[11px] text-zinc-500 font-medium hidden sm:table-cell">Description</th>
              </tr>
            </thead>
            <tbody>
              {API_ENDPOINTS.map((ep, idx) => (
                <tr
                  key={idx}
                  className={cn(
                    'border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/30',
                    idx === API_ENDPOINTS.length - 1 && 'border-b-0',
                  )}
                >
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
                      {ep.method}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-zinc-300">{ep.path}</span>
                    <br />
                    <span className="font-mono text-[10px] text-zinc-600">{ep.params}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">{ep.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Response format */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-4">
          <p className="text-[11px] text-zinc-500 mb-2">Response format</p>
          <pre className="text-[11px] font-mono text-zinc-400 leading-relaxed overflow-x-auto">
            {`{
  "success": boolean,
  "data": {},
  "generated_at": "ISO timestamp",
  "domain": "string"
}`}
          </pre>
        </div>
      </div>

      {/* ── Regenerate confirmation modal ── */}
      <Dialog open={regenModalOpen} onOpenChange={setRegenModalOpen}>
        <DialogContent className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-[15px]">Regenerate API Key</DialogTitle>
            <DialogDescription className="text-zinc-400 text-[13px] leading-relaxed">
              Regenerating your API key will{' '}
              <span className="text-red-400 font-medium">immediately invalidate</span> your current
              key. Any integrations using the old key will stop working until updated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => setRegenModalOpen(false)}
              className="h-9 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 text-[13px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="h-9 rounded-xl bg-red-500 text-white hover:bg-red-400 text-[13px] font-medium"
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Regenerating…
                </>
              ) : (
                'Yes, regenerate key'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
