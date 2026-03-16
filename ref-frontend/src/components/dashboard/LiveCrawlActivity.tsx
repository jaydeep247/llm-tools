'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Globe, Wifi, ExternalLink, ChevronRight, CheckCircle2, FileText, ArrowRight } from 'lucide-react'
import { useGetProjectSessionsQuery } from '@/store/api/sessionApi'
import { useGetSessionJobsQuery, useGetJobSnapshotQuery, useGetJobSummaryQuery } from '@/store/api/jobApi'
import type { Project } from '@/store/api/projectApi'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobInfo {
  jobId: string
  sessionId: string
  projectId: string
  projectName: string
}

// ─── Per-project watcher ──────────────────────────────────────────────────────

function ProjectCrawlWatcher({
  project,
  onRunningJob,
  onCompletedJob,
}: {
  project: Project
  onRunningJob: (info: JobInfo | null, projectId: string) => void
  onCompletedJob: (info: JobInfo | null, projectId: string) => void
}) {
  const { data: sessionsData } = useGetProjectSessionsQuery(
    { projectId: project.id, limit: 10 },
    { pollingInterval: 10000 }
  )

  const runningSession = sessionsData?.sessions?.find(
    (s: any) => s.status === 'IN_PROGRESS' || s.status === 'RUNNING'
  )

  const completedSession = !runningSession
    ? sessionsData?.sessions?.find(
        (s: any) => s.status === 'COMPLETED' || s.status === 'DONE'
      )
    : undefined

  const { data: runningJobsData } = useGetSessionJobsQuery(runningSession?.id ?? '', {
    skip: !runningSession,
  })

  const { data: completedJobsData } = useGetSessionJobsQuery(completedSession?.id ?? '', {
    skip: !completedSession,
  })

  const runningJob = runningJobsData?.data?.find(
    (j: any) => j.status === 'RUNNING' || j.status === 'PENDING'
  )

  const completedJob = completedJobsData?.data?.find(
    (j: any) => (j.type === 'CRAWL' || j.jobType === 'CRAWL') && j.status === 'COMPLETED'
  ) ?? completedJobsData?.data?.[0]

  useEffect(() => {
    if (runningJob && runningSession) {
      onRunningJob({ jobId: runningJob.id, sessionId: runningSession.id, projectId: project.id, projectName: project.name }, project.id)
    } else {
      onRunningJob(null, project.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningJob?.id, runningSession?.id, project.id])

  useEffect(() => {
    if (!runningSession && completedJob && completedSession) {
      onCompletedJob({ jobId: completedJob.id, sessionId: completedSession.id, projectId: project.id, projectName: project.name }, project.id)
    } else {
      onCompletedJob(null, project.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedJob?.id, completedSession?.id, runningSession?.id, project.id])

  return null
}

// ─── Snapshot feeder ──────────────────────────────────────────────────────────

function SnapshotFeeder({ jobId, onLinks }: { jobId: string; onLinks: (jobId: string, links: string[]) => void }) {
  const { data: snapshot } = useGetJobSnapshotQuery({ jobId, limit: 60 }, { pollingInterval: 5000 })

  useEffect(() => {
    if (!snapshot) return
    const urls = [...(snapshot.links ?? [])].sort((a, b) => b.timestamp - a.timestamp).map((l) => l.url)
    onLinks(jobId, urls)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  return null
}

// ─── Completed job summary fetcher ────────────────────────────────────────────

function CompletedJobSummaryFetcher({ jobId, onSummary }: { jobId: string; onSummary: (jobId: string, pages: number) => void }) {
  const { data: summary } = useGetJobSummaryQuery(jobId)

  useEffect(() => {
    if (!summary) return
    onSummary(jobId, summary.session?.total_pages ?? 0)
  }, [summary, jobId, onSummary])

  return null
}

// ─── Animated URL row ─────────────────────────────────────────────────────────

function UrlRow({ url, isNew }: { url: string; isNew: boolean }) {
  return (
    <div className={`flex items-center gap-2 py-1 transition-all duration-500 ${isNew ? 'animate-slide-in-from-top' : ''}`}>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      <Globe className="h-3 w-3 text-zinc-500 shrink-0" />
      <span className="text-xs text-zinc-300 font-mono truncate leading-none">{url}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  projects: Project[]
}

export function LiveCrawlActivity({ projects }: Props) {
  const router = useRouter()

  const [runningJobs, setRunningJobs] = useState<Record<string, JobInfo | null>>({})
  const [completedJobs, setCompletedJobs] = useState<Record<string, JobInfo | null>>({})
  const [jobLinks, setJobLinks] = useState<Record<string, string[]>>({})
  const [jobPageCounts, setJobPageCounts] = useState<Record<string, number>>({})
  const [displayUrls, setDisplayUrls] = useState<{ url: string; key: string }[]>([])
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set())
  const seenUrls = useRef<Set<string>>(new Set())

  const activeJobs: JobInfo[] = Object.values(runningJobs).filter((j): j is JobInfo => j !== null)
  const recentlyCompleted: JobInfo[] = Object.values(completedJobs).filter((j): j is JobInfo => j !== null)

  const allUrls = activeJobs.flatMap((j) => jobLinks[j.jobId] ?? [])
  const isActive = activeJobs.length > 0

  const handleRunningJob = useCallback((info: JobInfo | null, projectId: string) => {
    setRunningJobs((prev) => ({ ...prev, [projectId]: info }))
  }, [])

  const handleCompletedJob = useCallback((info: JobInfo | null, projectId: string) => {
    setCompletedJobs((prev) => ({ ...prev, [projectId]: info }))
  }, [])

  const handleLinks = useCallback((jobId: string, urls: string[]) => {
    setJobLinks((prev) => ({ ...prev, [jobId]: urls }))
  }, [])

  const handleSummary = useCallback((jobId: string, pages: number) => {
    setJobPageCounts((prev) => ({ ...prev, [jobId]: pages }))
  }, [])

  // Feed new URLs into rolling display list
  useEffect(() => {
    if (allUrls.length === 0) return
    const fresh = allUrls.filter((u) => !seenUrls.current.has(u))
    if (fresh.length === 0) return
    fresh.forEach((u) => seenUrls.current.add(u))
    setDisplayUrls((prev) =>
      [...fresh.map((u) => ({ url: u, key: `${u}-${Date.now()}-${Math.random()}` })), ...prev].slice(0, 30)
    )
    setNewKeys(new Set(fresh.map((u) => `${u}`)))
    setTimeout(() => setNewKeys(new Set()), 600)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allUrls.slice(0, 5))])

  useEffect(() => {
    if (!isActive) seenUrls.current.clear()
  }, [isActive])

  // Nothing to show at all
  if (!isActive && displayUrls.length === 0 && recentlyCompleted.length === 0) return null

  return (
    <>
      {/* Invisible watchers & feeders */}
      {projects.map((p) => (
        <ProjectCrawlWatcher key={p.id} project={p} onRunningJob={handleRunningJob} onCompletedJob={handleCompletedJob} />
      ))}
      {activeJobs.map((j) => (
        <SnapshotFeeder key={j.jobId} jobId={j.jobId} onLinks={handleLinks} />
      ))}
      {recentlyCompleted.map((j) => (
        <CompletedJobSummaryFetcher key={j.jobId} jobId={j.jobId} onSummary={handleSummary} />
      ))}

      {/* ── LIVE crawl card ── */}
      {(isActive || displayUrls.length > 0) && (
        <div className="rounded-xl border border-white/10 bg-[#0D0D0F] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              {isActive ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              ) : (
                <span className="h-2 w-2 rounded-full bg-zinc-600" />
              )}
              <span className="text-xs font-semibold text-white">
                {isActive ? 'Crawling in progress' : 'Recent crawl activity'}
              </span>
              {isActive && (
                <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {activeJobs.length} active
                </span>
              )}
            </div>
            {isActive && activeJobs[0] && (
              <button
                onClick={() => router.push(`/dashboard/projects/${activeJobs[0].projectId}/sessions/${activeJobs[0].sessionId}`)}
                className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                View live <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Active project pills */}
          {isActive && (
            <div className="flex items-center gap-2 px-4 pt-3 pb-1 flex-wrap">
              {activeJobs.map((j) => (
                <button
                  key={j.jobId}
                  onClick={() => router.push(`/dashboard/projects/${j.projectId}/sessions/${j.sessionId}`)}
                  className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                >
                  <Activity className="h-3 w-3" />
                  {j.projectName}
                  <ChevronRight className="h-2.5 w-2.5 opacity-60" />
                </button>
              ))}
            </div>
          )}

          {/* URL ticker */}
          <div className="px-4 py-3 space-y-0.5 max-h-44 overflow-hidden">
            {displayUrls.length === 0 ? (
              <div className="flex items-center gap-2 py-2">
                <Wifi className="h-3.5 w-3.5 text-zinc-600 animate-pulse" />
                <span className="text-xs text-zinc-500">Waiting for URLs…</span>
              </div>
            ) : (
              displayUrls.map(({ url, key }) => (
                <UrlRow key={key} url={url} isNew={newKeys.has(url)} />
              ))
            )}
          </div>

          {/* Bottom stats bar */}
          {displayUrls.length > 0 && (
            <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3">
              <span className="text-[10px] text-zinc-500">
                {displayUrls.length} URL{displayUrls.length !== 1 ? 's' : ''} discovered
              </span>
              {allUrls.length > 30 && <span className="text-[10px] text-zinc-600">showing latest 30</span>}
            </div>
          )}
        </div>
      )}

      {/* ── COMPLETED crawl cards ── */}
      {!isActive && recentlyCompleted.map((j) => {
        const pages = jobPageCounts[j.jobId] ?? 0
        return (
          <div key={j.jobId} className="rounded-xl border border-emerald-500/15 bg-[#0D0D0F] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-white">Crawl complete</span>
                <span className="text-[10px] text-zinc-400">{j.projectName}</span>
              </div>
              <button
                onClick={() => router.push(`/dashboard/projects/${j.projectId}/sessions/${j.sessionId}`)}
                className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                View results <ExternalLink className="h-3 w-3" />
              </button>
            </div>

            {/* Stats + CTA */}
            <div className="px-4 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <FileText className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-lg font-bold text-white leading-none">{pages > 0 ? pages.toLocaleString() : '—'}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">pages found</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => router.push(`/dashboard/projects/${j.projectId}/sessions/${j.sessionId}`)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
              >
                View more
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      })}

      <style>{`
        @keyframes slide-in-from-top {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-in-from-top {
          animation: slide-in-from-top 0.4s ease-out;
        }
      `}</style>
    </>
  )
}
