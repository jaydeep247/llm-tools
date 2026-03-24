'use client'

import { BookOpen, Clock } from 'lucide-react'

interface AICitationRankingProps {
  jobId?: string
  url?: string
}

export default function AICitationRanking(_props: AICitationRankingProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-5">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/50">
        <BookOpen className="w-7 h-7 text-cyan-400" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-zinc-100">Citations Tracker</h3>
        <p className="text-sm text-zinc-400 max-w-sm">
          Deep AI citation tracking across ChatGPT, Gemini, and Claude is coming soon.
          You&apos;ll be able to see exactly where your URL appears in AI-generated responses,
          your citation position, percentile ranking, and more.
        </p>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/60 border border-zinc-700/50">
        <Clock className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs text-zinc-500 font-medium tracking-wide uppercase">Coming Soon</span>
      </div>
    </div>
  )
}
