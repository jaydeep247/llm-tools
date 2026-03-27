import { Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleCProgressLoaderProps {
  progress: number
  phaseLabel?: string
  title?: string
}

const SECTIONS = [
  'AI Visibility',
  'Scorecards',
  'Entity & Gap Analysis',
  'AI Answer Preview',
  'Improvement Actions',
  'Model Comparison',
]

export default function ModuleCProgressLoader({
  progress,
  phaseLabel,
  title = 'Running Module C Analysis',
}: ModuleCProgressLoaderProps) {
  const safeProgress = Math.max(0, Math.min(100, progress))
  const radius = 48
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (safeProgress / 100) * circumference
  const completedCount = safeProgress >= 100
    ? SECTIONS.length
    : Math.floor((safeProgress / 100) * SECTIONS.length)

  return (
    <div className="relative overflow-hidden rounded-3xl border border-zinc-700/70 bg-zinc-950/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="pointer-events-none absolute -left-24 top-0 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-40 w-40 rounded-full bg-cyan-400/15 blur-3xl" />

      <div className="relative space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              <Sparkles className="h-3 w-3 text-cyan-300" />
              Live Analysis
            </div>
            <h3 className="mt-3 text-lg font-semibold tracking-tight text-white">{title}</h3>
            <p className="mt-1 text-sm text-zinc-400">{phaseLabel || 'Preparing analysis pipeline'}</p>
          </div>

          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Streamed Progress</p>
            <p className="text-4xl font-semibold tabular-nums text-white">{Math.round(safeProgress)}%</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/70 p-4">
            <div className="relative mx-auto flex h-36 w-36 items-center justify-center">
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="module-c-progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="55%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth="10" fill="none" />
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  stroke="url(#module-c-progress-gradient)"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="text-center">
                <p className="text-3xl font-semibold tabular-nums text-white">{Math.round(safeProgress)}</p>
                <p className="text-xs text-zinc-500">percent</p>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-400">Updating continuously from live events</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="h-3 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900/80">
                <div
                  className="relative h-full rounded-full bg-linear-to-r from-sky-500 via-cyan-400 to-emerald-400 transition-all duration-500"
                  style={{ width: `${safeProgress}%` }}
                >
                  {safeProgress < 100 && (
                    <div className="absolute inset-y-0 right-0 w-12 animate-pulse bg-white/30" />
                  )}
                </div>
              </div>
              <div className="flex justify-between text-[10px] tracking-wide text-zinc-500">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {SECTIONS.map((section, index) => {
                const isCompleted = index < completedCount
                const isActive = !isCompleted && index === completedCount && safeProgress < 100

                return (
                  <div
                    key={section}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs',
                      isCompleted
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : isActive
                          ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                          : 'border-zinc-700/70 bg-zinc-900/60 text-zinc-500',
                    )}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current/30 text-[10px] font-semibold">
                      {index + 1}
                    </span>
                    <span className="truncate">{section}</span>
                    <span className="ml-auto">
                      {isCompleted ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : isActive ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
