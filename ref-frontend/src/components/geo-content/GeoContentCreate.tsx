'use client'

import { useState, KeyboardEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, X, HelpCircle, ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useGenerateGeoContentMutation } from '@/store/api/geoContentApi'
import { useGetOnboardingDataQuery } from '@/store/api/brandOnboardingApi'

export function GeoContentCreate({ jobId: propJobId, inSession, onSuccess }: { jobId?: string; inSession?: boolean; onSuccess?: (id: string) => void } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Prefer prop (when embedded in session page) over URL param (standalone)
  const jobId = propJobId ?? searchParams.get('jobId') ?? undefined

  // Form state
  const [brief, setBrief] = useState('')
  const [title, setTitle] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [targetPrompt, setTargetPrompt] = useState('')
  const [listicle, setListicle] = useState(false)

  // Collapsible sections
  const [showTitle, setShowTitle] = useState(false)
  const [showKeywords, setShowKeywords] = useState(false)

  // Loading / error
  const [formError, setFormError] = useState<string | null>(null)

  const [generate, { isLoading }] = useGenerateGeoContentMutation()

  // Pull the brand's selected prompts from onboarding data.
  const { data: onboardingData } = useGetOnboardingDataQuery(jobId ?? '', {
    skip: !jobId,
  })
  const brandPrompts: string[] = onboardingData?.prompts_selected ?? []

  // ─── Keyword tag input ──────────────────────────────────────────────────────

  const addKeyword = (raw: string) => {
    const parts = raw.split(',').map((k) => k.trim()).filter(Boolean)
    const toAdd = parts.filter((k) => !keywords.includes(k) && keywords.length < 20)
    if (toAdd.length) setKeywords((prev) => [...prev, ...toAdd])
    setKeywordInput('')
  }

  const handleKeywordKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addKeyword(keywordInput)
    } else if (e.key === 'Backspace' && !keywordInput && keywords.length > 0) {
      setKeywords((prev) => prev.slice(0, -1))
    }
  }

  const removeKeyword = (kw: string) => setKeywords((prev) => prev.filter((k) => k !== kw))

  // ─── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!brief.trim()) {
      setFormError('Content brief is required.')
      return
    }
    setFormError(null)
    try {
      const result = await generate({
        brief: brief.trim(),
        ...(title.trim() && { title: title.trim() }),
        ...(keywords.length && { keywords }),
        ...(targetPrompt && targetPrompt !== 'none' && { targetPrompt }),
        listicle,
      }).unwrap()
      if (onSuccess) {
        onSuccess(result.id)
      } else {
        router.push(`/dashboard/geo-content/${result.id}`)
      }
    } catch (err: any) {
      setFormError(err?.data?.message || err?.message || 'Generation failed. Please try again.')
    }
  }

  // ─── Loading overlay ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-fade-in-hero">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-indigo-400" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-lg">Generating your GEO article…</p>
          <p className="text-zinc-500 text-sm mt-1">Claude is writing your content. This takes ~30 seconds.</p>
        </div>
      </div>
    )
  }

  // ─── Form ────────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-hero pb-16">
        {/* Back link — hidden when embedded inside a session */}
        {!inSession && (
          <button
            id="geo-create-back-btn"
            onClick={() => router.push('/dashboard/geo-content')}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-sm transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Content list
          </button>
        )}

        {/* Page title — hidden when embedded */}
        {!inSession && (
          <div>
            <h1 className="text-2xl font-bold text-white">Create GEO Article</h1>
            <p className="text-zinc-500 text-sm mt-1">
              Generate a long-form article optimized to appear in AI-generated answers.
            </p>
          </div>
        )}

        {/* Form card */}
        <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-6 space-y-6">

          {/* ── Content Brief ── */}
          <div className="space-y-2">
            <label htmlFor="geo-brief" className="block text-sm font-medium text-white">
              Content Brief <span className="text-red-400">*</span>
            </label>
            <textarea
              id="geo-brief"
              rows={5}
              placeholder="Describe what the article should cover, the audience, and any important context."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="w-full rounded-lg bg-zinc-800/50 border border-zinc-700 text-white placeholder:text-zinc-600 text-sm px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
            />
          </div>

          {/* ── Title (collapsible) ── */}
          <div className="space-y-2">
            <button
              id="geo-toggle-title"
              type="button"
              onClick={() => setShowTitle((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
            >
              {showTitle ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Specify title (optional)
            </button>
            {showTitle && (
              <Input
                id="geo-title"
                placeholder="e.g. 10 Best Practices for B2B SaaS Content Marketing"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-600"
              />
            )}
          </div>

          {/* ── Keywords (collapsible) ── */}
          <div className="space-y-2">
            <button
              id="geo-toggle-keywords"
              type="button"
              onClick={() => setShowKeywords((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
            >
              {showKeywords ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Add Target Search Keywords (optional)
            </button>
            {showKeywords && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5 min-h-9 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500/50 transition-colors">
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => removeKeyword(kw)}
                        className="text-indigo-400 hover:text-indigo-200 cursor-pointer"
                        aria-label={`Remove keyword ${kw}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="geo-keyword-input"
                    type="text"
                    placeholder={keywords.length === 0 ? 'Type keyword and press Enter or comma…' : ''}
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={handleKeywordKeyDown}
                    onBlur={() => keywordInput && addKeyword(keywordInput)}
                    className="flex-1 min-w-32 bg-transparent text-white placeholder:text-zinc-600 text-sm focus:outline-none"
                  />
                </div>
                <p className="text-xs text-zinc-600">Separate with commas or Enter key. Max 20 keywords.</p>
              </div>
            )}
          </div>

          {/* ── Target Prompt ── */}
          <div className="space-y-2">
            <label htmlFor="geo-target-prompt" className="block text-sm font-medium text-white">
              Target Prompt
              <span className="ml-1.5 text-zinc-500 font-normal">(optional)</span>
            </label>
            <Select value={targetPrompt} onValueChange={setTargetPrompt}>
              <SelectTrigger
                id="geo-target-prompt"
                className="bg-zinc-800/50 border-zinc-700 text-white data-[placeholder]:text-zinc-600"
              >
                <SelectValue placeholder="No prompt selected" />
              </SelectTrigger>
              <SelectContent className="bg-[#161618] border-zinc-700">
                <SelectItem value="none" className="text-zinc-400">
                  No prompt selected
                </SelectItem>
                {brandPrompts.map((prompt, i) => (
                  <SelectItem
                    key={i}
                    value={prompt}
                    className="text-zinc-200 focus:bg-zinc-800 focus:text-white"
                  >
                    <span className="truncate max-w-sm block">{prompt}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-600">
              The article will be structured to be cited verbatim by AI models for this prompt.
            </p>
          </div>

          {/* ── Listicle toggle ── */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">Listicle format</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-zinc-600 hover:text-zinc-400 cursor-pointer">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="max-w-xs bg-[#1a1a1c] border-zinc-700 text-zinc-200 text-xs"
                >
                  When ON, the article is structured as a numbered list (e.g. &quot;11 Best Practices for X&quot;).
                  Listicles are highly citation-friendly for AI models.
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch
              id="geo-listicle-toggle"
              checked={listicle}
              onCheckedChange={setListicle}
              className="data-[state=checked]:bg-indigo-600"
            />
          </div>

          {/* ── Error ── */}
          {formError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
              <p className="text-red-300 text-sm">{formError}</p>
            </div>
          )}

          {/* ── Submit ── */}
          <Button
            id="geo-submit-btn"
            onClick={handleSubmit}
            disabled={!brief.trim() || isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 h-11"
          >
            <Sparkles className="h-4 w-4" />
            Create
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}
