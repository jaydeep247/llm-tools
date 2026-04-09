'use client'

import { Bot, MessageSquare, Search, Send, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModuleFAskAiMarkdown } from '@/components/module_F/ModuleFAskAiMarkdown'
import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react'

export type ModuleDAskAiChatTurn = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

type ModuleDAskAiChatShellProps = {
  chatScrollRef: Ref<HTMLDivElement>
  chatMessages: ModuleDAskAiChatTurn[]
  chatInput: string
  setChatInput: (v: string) => void
  isAskingAI: boolean
  askAIError: unknown
  onSubmit: (e?: FormEvent) => void
  onSuggestionClick: (text: string) => void
  suggestions: string[]
  focusBadge?: string
}

const FALLBACK_SUGGESTIONS = [
  'Summarize my prompt tracking results in plain language.',
  'Which prompts have the lowest PVS and what should I do first?',
  'What is my top priority recommendation right now?',
]

export function ModuleDAskAiChatShell({
  chatScrollRef,
  chatMessages,
  chatInput,
  setChatInput,
  isAskingAI,
  askAIError,
  onSubmit,
  onSuggestionClick,
  suggestions,
  focusBadge,
}: ModuleDAskAiChatShellProps) {
  const [renderedById, setRenderedById] = useState<Record<string, string>>({})
  const animTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const assistantMessages = chatMessages.filter((m) => m.role === 'assistant')
    const assistantIds = assistantMessages.map((m) => m.id)
    const assistantIdSet = new Set(assistantIds)

    if (assistantMessages.length === 0) {
      for (const t of Object.values(animTimersRef.current)) window.clearInterval(t)
      animTimersRef.current = {}
      setRenderedById({})
      return
    }

    for (const m of assistantMessages) {
      if (renderedById[m.id] !== undefined) continue
      const full = m.content || ''
      setRenderedById((prev) => ({ ...prev, [m.id]: '' }))
      if (!full) continue

      let idx = 0
      const timer = window.setInterval(() => {
        idx = Math.min(full.length, idx + 6)
        setRenderedById((prev) => ({ ...prev, [m.id]: full.slice(0, idx) }))
        if (idx >= full.length) {
          window.clearInterval(timer)
          delete animTimersRef.current[m.id]
        }
      }, 18)

      animTimersRef.current[m.id] = timer
    }

    for (const id of Object.keys(renderedById)) {
      if (!assistantIdSet.has(id)) {
        const t = animTimersRef.current[id]
        if (t) window.clearInterval(t)
        delete animTimersRef.current[id]
        setRenderedById((prev) => {
          const copy = { ...prev }
          delete copy[id]
          return copy
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages])

  const chipSuggestions = suggestions.length ? suggestions : FALLBACK_SUGGESTIONS

  return (
    <div
      className={cn(
        'flex max-h-[min(92vh,880px)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-zinc-800/90',
        'bg-gradient-to-b from-[#141416] via-[#111113] to-[#0a0a0b]',
        'shadow-2xl shadow-black/60',
      )}
    >
      <header className="shrink-0 border-b border-zinc-800/90 bg-zinc-950/40 px-5 py-5 sm:px-8 sm:py-6">
        <div className="flex gap-4">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
              'bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-lg shadow-violet-950/50',
              'ring-2 ring-white/10',
            )}
            aria-hidden
          >
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Ask AI</h2>
              <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-300">
                Discover Prompts
              </span>
              {focusBadge && (
                <span className="rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">
                  {focusBadge}
                </span>
              )}
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Ask questions based on your latest Module D analysis: prompt visibility, citation trends,
              content gaps, and recommendations.
            </p>
          </div>
        </div>
      </header>

      <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-8">
        {chatMessages.length === 0 && !isAskingAI ? (
          <div className="mx-auto max-w-2xl space-y-6 py-4">
            <div className="rounded-2xl border border-dashed border-zinc-700/60 bg-zinc-950/50 p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
                <MessageSquare className="h-7 w-7 text-zinc-500" />
              </div>
              <p className="text-base leading-relaxed text-zinc-400">
                Start with a suggested question or ask anything about Module D results.
              </p>
            </div>
            <div>
              <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-zinc-600">
                Suggested questions
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
                {chipSuggestions.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onSuggestionClick(label)}
                    className={cn(
                      'rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3 text-left text-sm text-zinc-300',
                      'transition-all hover:border-violet-500/40 hover:bg-zinc-800/80 hover:text-white',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {chatMessages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex flex-col items-end gap-1.5 pl-8 sm:pl-16">
              <span className="pr-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">You</span>
              <div className="max-w-[min(100%,36rem)] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 px-5 py-4 text-base leading-relaxed text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-3 sm:gap-4">
              <div className="mt-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 ring-1 ring-zinc-700 sm:flex">
                <Bot className="h-4 w-4 text-violet-400" />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Assistant</span>
                <div className="overflow-hidden rounded-2xl rounded-tl-md border border-zinc-700/60 bg-zinc-900/95">
                  {m.sources && m.sources.length > 0 ? (
                    <div className="border-b border-zinc-800/80 bg-black/25 px-4 py-3 sm:px-5">
                      <div className="inline-flex w-full max-w-full flex-wrap items-start gap-2 rounded-full border border-violet-500/20 bg-violet-950/25 px-3 py-2 sm:px-4">
                        <Search className="mt-0.5 size-4 shrink-0 text-violet-400" aria-hidden />
                        <div className="min-w-0 text-sm leading-snug">
                          <span className="font-semibold text-violet-300/90">Context used</span>
                          <span className="text-zinc-600"> - </span>
                          <span className="text-zinc-300">{m.sources.join(' · ')}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="px-4 py-4 sm:px-6 sm:py-5">
                    <ModuleFAskAiMarkdown content={renderedById[m.id] ?? m.content} />
                  </div>
                </div>
              </div>
            </div>
          ),
        )}

        {isAskingAI ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 px-5 py-4 text-base text-zinc-400">
            Reading your latest Module D data...
          </div>
        ) : null}

        {askAIError && chatMessages.length === 0 ? (
          <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-base text-red-400">
            {(askAIError as { data?: { message?: string; error?: string } })?.data?.message ||
              (askAIError as { data?: { error?: string } })?.data?.error ||
              'Something went wrong. Check backend API connectivity and try again.'}
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-zinc-800/90 bg-zinc-950/80 p-4 sm:p-5 sm:px-8">
        <div className="flex gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-2 pl-3">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isAskingAI}
            className="h-11 flex-1 border-0 bg-transparent text-base text-zinc-100 placeholder:text-zinc-500 shadow-none focus-visible:ring-0 md:h-12 md:text-[17px]"
            autoComplete="off"
            aria-label="Chat message"
          />
          <Button
            type="submit"
            disabled={isAskingAI || !chatInput.trim()}
            className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white md:h-12 md:w-12"
            aria-label="Send message"
          >
            <Send className="h-5 w-5 md:h-6 md:w-6" />
          </Button>
        </div>
      </form>
    </div>
  )
}
