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
    <div className="relative overflow-hidden rounded-3xl p-6" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)', boxShadow: '0 4px 24px rgba(83,71,206,0.08)' }}>
      <div className="pointer-events-none absolute -left-24 top-0 h-48 w-48 rounded-full opacity-30 blur-3xl" style={{ background: 'rgba(83,71,206,0.15)' }} />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-40 w-40 rounded-full opacity-20 blur-3xl" style={{ background: 'rgba(136,124,253,0.2)' }} />

      <div className="relative space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em]" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-secondary)' }}>
              <Sparkles className="h-3 w-3" style={{ color: 'var(--nd-purple)' }} />
              Live Analysis
            </div>
            <h3 className="mt-3 text-lg font-bold tracking-tight" style={{ color: 'var(--nd-text-primary)' }}>{title}</h3>
            <p className="mt-1 text-sm font-medium" style={{ color: 'var(--nd-text-secondary)' }}>{phaseLabel || 'Preparing analysis pipeline'}</p>
          </div>

          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-secondary)' }}>Streamed Progress</p>
            <p className="text-4xl font-bold tabular-nums" style={{ color: 'var(--nd-text-primary)' }}>{Math.round(safeProgress)}%</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="rounded-2xl p-4" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
            <div className="relative mx-auto flex h-36 w-36 items-center justify-center">
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="module-c-progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#5347CE" />
                    <stop offset="55%" stopColor="#887CFD" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r={radius} stroke="var(--nd-border)" strokeWidth="10" fill="none" />
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
                <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--nd-text-primary)' }}>{Math.round(safeProgress)}</p>
                <p className="text-xs font-bold uppercase" style={{ color: 'var(--nd-text-secondary)' }}>percent</p>
              </div>
            </div>
            <p className="mt-3 text-center text-xs font-medium" style={{ color: 'var(--nd-text-secondary)' }}>Updating continuously from live events</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="h-3 overflow-hidden rounded-full" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
                <div
                  className="relative h-full rounded-full transition-all duration-500"
                  style={{ width: `${safeProgress}%`, background: 'linear-gradient(to right, #5347CE, #887CFD, #10b981)' }}
                >
                  {safeProgress < 100 && (
                    <div className="absolute inset-y-0 right-0 w-12 animate-pulse bg-white/40" />
                  )}
                </div>
              </div>
              <div className="flex justify-between text-xs font-bold tracking-wide" style={{ color: 'var(--nd-text-secondary)' }}>
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
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold"
                    style={
                      isCompleted
                        ? { border: '1px solid #A7F3D0', background: '#ECFDF5', color: '#059669' }
                        : isActive
                          ? { border: '1px solid rgba(83,71,206,0.3)', background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }
                          : { border: '1px solid var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-secondary)' }
                    }
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current/30 text-xs font-bold">
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
