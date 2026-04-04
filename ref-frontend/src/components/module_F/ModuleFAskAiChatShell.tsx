'use client'

import { Bot, MessageSquare, Search, Send, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModuleFAskAiMarkdown } from '@/components/module_F/ModuleFAskAiMarkdown'
import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react'

export type AskAiChatTurn = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

type ModuleFAskAiChatShellProps = {
  brandName: string
  chatScrollRef: Ref<HTMLDivElement>
  chatMessages: AskAiChatTurn[]
  chatInput: string
  setChatInput: (v: string) => void
  isAskingAI: boolean
  askAIError: unknown
  onSubmit: (e?: FormEvent) => void
  onSuggestionClick: (text: string) => void
}

const SUGGESTIONS = [
  'Who are my main competitors?',
  'Explain my D7 score and grade',
  'What should I prioritize first?',
]

export function ModuleFAskAiChatShell({
  brandName,
  chatScrollRef,
  chatMessages,
  chatInput,
  setChatInput,
  isAskingAI,
  askAIError,
  onSubmit,
  onSuggestionClick,
}: ModuleFAskAiChatShellProps) {
  // UI-simulated streaming: reveal assistant text progressively once the full answer arrives.
  const [renderedById, setRenderedById] = useState<Record<string, string>>({})
  const animTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const assistantMessages = chatMessages.filter((m) => m.role === 'assistant')
    const assistantIds = assistantMessages.map((m) => m.id)
    const assistantIdSet = new Set(assistantIds)

    // If chat cleared, stop animations and reset.
    if (assistantMessages.length === 0) {
      for (const t of Object.values(animTimersRef.current)) {
        window.clearInterval(t)
      }
      animTimersRef.current = {}
      setRenderedById({})
      return
    }

    // Start animations for new assistant messages.
    for (const m of assistantMessages) {
      if (renderedById[m.id] !== undefined) continue // already animating or complete

      const full = m.content || ''
      setRenderedById((prev) => ({ ...prev, [m.id]: '' }))

      if (!full) continue

      let idx = 0
      const chunk = 6
      const tickMs = 18

      const timer = window.setInterval(() => {
        idx = Math.min(full.length, idx + chunk)
        const next = full.slice(0, idx)
        setRenderedById((prev) => ({ ...prev, [m.id]: next }))

        if (idx >= full.length) {
          window.clearInterval(timer)
          delete animTimersRef.current[m.id]
        }
      }, tickMs)

      animTimersRef.current[m.id] = timer
    }

    // Cleanup removed assistant messages
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
  return (
    <div
      className={cn(
        'flex max-h-[min(92vh,880px)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-zinc-800/90',
        'bg-gradient-to-b from-[#141416] via-[#111113] to-[#0a0a0b]',
        'shadow-2xl shadow-black/60',
      )}
    >
      {/* Header */}
      <header className="shrink-0 border-b border-zinc-800/90 bg-zinc-950/40 px-5 py-5 sm:px-8 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  Ask AI
                </h2>
                <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-300">
                  Competitor wins
                </span>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
                Questions use your latest{' '}
                <span className="text-zinc-300">Module F</span> run: D7, MOAT 4 actions, win/loss
                prompts, and gaps. Ask in your own words.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={chatScrollRef}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8',
          'space-y-6 scroll-smooth',
          '[scrollbar-width:thin] [scrollbar-color:rgb(63_63_70)_transparent]',
          '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-600',
        )}
      >
        {chatMessages.length === 0 && !isAskingAI ? (
          <div className="mx-auto max-w-2xl space-y-6 py-4">
            <div className="rounded-2xl border border-dashed border-zinc-700/60 bg-zinc-950/50 p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
                <MessageSquare className="h-7 w-7 text-zinc-500" />
              </div>
              <p className="text-base leading-relaxed text-zinc-400">
                Start a conversation about your competitive AI visibility. Try one of the suggestions below
                or type your own question.
              </p>
              <p className="mt-3 text-sm text-zinc-600">
                Active brand in this analysis:{' '}
                <span className="font-medium text-zinc-400">{brandName}</span>
              </p>
            </div>
            <div>
              <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-zinc-600">
                Suggested questions
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
                {SUGGESTIONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onSuggestionClick(label)}
                    className={cn(
                      'rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3 text-left text-sm text-zinc-300',
                      'transition-all hover:border-violet-500/40 hover:bg-zinc-800/80 hover:text-white',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50',
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
              <span className="pr-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                You
              </span>
              <div
                className={cn(
                  'max-w-[min(100%,36rem)] rounded-2xl rounded-tr-md px-5 py-4 text-base leading-relaxed text-white',
                  'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600',
                  'shadow-lg shadow-fuchsia-950/35 ring-1 ring-white/10',
                  'whitespace-pre-wrap break-words',
                )}
              >
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-3 sm:gap-4">
              <div
                className="mt-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 ring-1 ring-zinc-700 sm:flex"
                aria-hidden
              >
                <Bot className="h-4 w-4 text-violet-400" />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-400 sm:hidden" aria-hidden />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Assistant
                  </span>
                </div>
                <div
                  className={cn(
                    'overflow-hidden rounded-2xl rounded-tl-md border border-zinc-700/60 bg-zinc-900/95',
                    'shadow-xl shadow-black/40 ring-1 ring-white/[0.04]',
                  )}
                >
                  {m.sources && m.sources.length > 0 ? (
                    <div className="border-b border-zinc-800/80 bg-black/25 px-4 py-3 sm:px-5">
                      <div
                        className={cn(
                          'inline-flex w-full max-w-full flex-wrap items-start gap-2 rounded-full border border-violet-500/20',
                          'bg-violet-950/25 px-3 py-2 sm:px-4',
                        )}
                      >
                        <Search className="mt-0.5 size-4 shrink-0 text-violet-400" aria-hidden />
                        <div className="min-w-0 text-sm leading-snug">
                          <span className="font-semibold text-violet-300/90">Context used</span>
                          <span className="text-zinc-600"> — </span>
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
          <div className="flex gap-3 sm:gap-4">
            <div className="mt-1 hidden h-9 w-9 shrink-0 rounded-xl bg-zinc-800 ring-1 ring-zinc-700 sm:block" />
            <div
              className={cn(
                'flex max-w-[min(100%,52rem)] items-center gap-3 rounded-2xl rounded-tl-md border border-zinc-800',
                'bg-zinc-950/90 px-5 py-4 text-base text-zinc-400',
              )}
            >
              <span className="flex gap-1.5" aria-hidden>
                <span className="inline-block size-2 animate-pulse rounded-full bg-violet-500" />
                <span className="inline-block size-2 animate-pulse rounded-full bg-fuchsia-500 [animation-delay:150ms]" />
                <span className="inline-block size-2 animate-pulse rounded-full bg-pink-500 [animation-delay:300ms]" />
              </span>
              <span>Reading your Module F data…</span>
            </div>
          </div>
        ) : null}

        {askAIError && chatMessages.length === 0 ? (
          <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-base text-red-400">
            {(askAIError as { data?: { message?: string } })?.data?.message ||
              'Something went wrong. Check that npy-backend is running and NPY_BACKEND_URL is set.'}
          </p>
        ) : null}
      </div>

      {/* Composer */}
      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-zinc-800/90 bg-zinc-950/80 p-4 sm:p-5 sm:px-8"
      >
        <div
          className={cn(
            'flex gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-2 pl-3 shadow-inner',
            'ring-offset-2 ring-offset-[#0a0a0b] focus-within:border-violet-500/40 focus-within:ring-2 focus-within:ring-violet-500/25',
          )}
        >
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={isAskingAI}
            className={cn(
              'h-11 flex-1 border-0 bg-transparent text-base text-zinc-100 placeholder:text-zinc-500',
              'shadow-none focus-visible:ring-0 md:h-12 md:text-[17px]',
            )}
            autoComplete="off"
            aria-label="Chat message"
          />
          <Button
            type="submit"
            disabled={isAskingAI || !chatInput.trim()}
            className={cn(
              'h-11 w-11 shrink-0 rounded-xl md:h-12 md:w-12',
              'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-950/40',
              'hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40',
            )}
            aria-label="Send message"
          >
            <Send className="h-5 w-5 md:h-6 md:w-6" />
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-600">
          Answers reflect your latest saved Module F run. Not legal or financial advice.
        </p>
      </form>
    </div>
  )
}
