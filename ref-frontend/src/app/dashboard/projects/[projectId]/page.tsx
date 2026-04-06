'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Clock, Globe, CheckCircle, XCircle, Loader2, AlertCircle, Play, Pencil, Trash2 } from 'lucide-react'
import { useGetProjectQuery, useUpdateProjectMutation, type Project } from '@/store/api/projectApi'
import { useGetProjectSessionsQuery, useCreateSessionMutation, useCreateJobMutation, useDeleteSessionMutation } from '@/store/api/sessionApi'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ProjectEditDialog } from '@/components/dashboard/ProjectEditDialog'
import { ProjectDeleteDialog } from '@/components/dashboard/ProjectDeleteDialog'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ProjectDetailSkeleton, TableRowSkeleton } from '@/components/ui/PageLoader'
import type { CrawlSession } from '@/store/api/sessionApi'
import { useAuth } from '@/hooks/useAuth'

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  const { user } = useAuth()
  const { data: projectData, isLoading: isLoadingProject, error: projectError } = useGetProjectQuery(projectId, { refetchOnMountOrArgChange: true })
  const { data: sessionsData, isLoading: isLoadingSessions } = useGetProjectSessionsQuery({ projectId }, { refetchOnMountOrArgChange: true })
  const [createSession, { isLoading: isCreatingSession }] = useCreateSessionMutation()
  const [createJob, { isLoading: isCreatingJob }] = useCreateJobMutation()
  const [deleteSession, { isLoading: isDeletingSession }] = useDeleteSessionMutation()
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [updateProject] = useUpdateProjectMutation()
  const { confirm, ConfirmUI } = useConfirm()

  const [editingName, setEditingName] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [tempName, setTempName] = useState('')
  const [tempDesc, setTempDesc] = useState('')

  const handleSaveName = async () => {
    if (!tempName.trim()) return
    try {
      await updateProject({ projectId, data: { name: tempName } }).unwrap()
      setEditingName(false)
    } catch (err) {
      console.error('Failed to update name', err)
    }
  }

  const handleSaveDesc = async () => {
    try {
      await updateProject({ projectId, data: { description: tempDesc } }).unwrap()
      setEditingDesc(false)
    } catch (err) {
      console.error('Failed to update description', err)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    const ok = await confirm({
      title: 'Delete session?',
      description: 'This will stop any running analysis and permanently remove all associated data. This action cannot be undone.',
      confirmLabel: 'Delete session',
      destructive: true,
    })
    if (!ok) return
    setDeletingSessionId(sessionId)
    try {
      await deleteSession(sessionId).unwrap()
    } catch (err) {
      console.error('Failed to delete session', err)
    } finally {
      setDeletingSessionId(null)
    }
  }


  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

  const isStartingCrawl = isCreatingSession || isCreatingJob

  // Form state
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (isLoadingProject) {
    return <ProjectDetailSkeleton />
  }

  if (projectError || !projectData) {
    return (
      <div className="space-y-8 animate-fade-in-hero">
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-16 w-16 text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Project not found</h2>
          <p className="text-zinc-500 mb-4">The project you're looking for doesn't exist</p>
          <Button onClick={() => router.push('/dashboard/projects')} className="bg-white text-black hover:bg-slate-100">
            Back to Projects
          </Button>
        </div>
      </div>
    )
  }

  const project = projectData.project
  const sessions = sessionsData?.sessions || []

  const normalizeUrl = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return trimmed
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  }

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase()
    switch (s) {
      case 'completed':
        return 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'
      case 'running':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
      case 'auditing':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20'
      case 'failed':
        return 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
      case 'created':
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/20'
      default:
        return 'bg-zinc-800/40 text-zinc-500 border-zinc-800 hover:bg-zinc-800/50'
    }
  }

  const getStatusIcon = (status: string) => {
    const s = status.toLowerCase()
    switch (s) {
      case 'completed':
        return <CheckCircle className="h-4 w-4" />
      case 'running':
      case 'auditing':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'failed':
        return <XCircle className="h-4 w-4" />
      default:
        return null
    }
  }

  const handleStartSession = async () => {
    if (!url.trim()) {
      setError('Please enter a URL')
      return
    }

    setError(null)

    try {
      // Step 1: Create session
      const sessionResult = await createSession(projectId).unwrap()
      const sessionId = sessionResult.session.id

      const normalizedUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`

      // Step 2: Fire ONE quick-start job that runs Brand Analysis,
      // Competitor Mentions, and AI Share of Voice in parallel on the Python side.
      const jobResult = await createJob({
        sessionId,
        data: { url: normalizedUrl, jobType: 'MODULE_E_QUICK_START' },
      }).unwrap()

      // Step 3: Navigate to the progress page, overlaying brand onboarding.
      // Use replace so the back button from the session page returns to the
      // project page — not back into the progress page with showBrandOnboarding=1.
      const progressParams = new URLSearchParams({
        projectId,
        sessionId,
        url: normalizedUrl,
        showBrandOnboarding: '1',
        ...(jobResult.job.isCacheHit ? { cacheHit: '1' } : {}),
      })
      router.replace(`/dashboard/jobs/${jobResult.job.id}/progress?${progressParams.toString()}`)
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Failed to start session')
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in-hero">
      {/* Header */}
      <div className="space-y-2 sm:space-y-3">
        <div className="flex flex-col gap-2">
          {/* Project Name */}
          <div className="min-h-10 flex items-center">
            {editingName ? (
              <div className="flex items-center gap-2 flex-1 max-w-xl">
                <Input
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="text-2xl sm:text-3xl md:text-4xl font-bold text-white bg-zinc-800/50 border-zinc-700 h-auto py-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                />
                <Button onClick={handleSaveName} size="icon" variant="ghost" className="h-8 w-8 hover:bg-green-500/20 text-green-400 cursor-pointer shrink-0">
                  <CheckCircle className="h-5 w-5" />
                </Button>
                <Button onClick={() => setEditingName(false)} size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-500/20 text-red-400 cursor-pointer shrink-0">
                  <XCircle className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <div className="group flex items-center gap-2 max-w-full w-fit">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white truncate">{project.name}</h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-white/50 hover:text-white hover:bg-zinc-800/50 pointer-events-none group-hover:pointer-events-auto shrink-0"
                  onClick={() => {
                    setTempName(project.name)
                    setEditingName(true)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Project Description */}
          <div className="min-h-6 flex items-center">
            {editingDesc ? (
              <div className="flex items-center gap-2 flex-1 max-w-xl">
                <Input
                  value={tempDesc}
                  onChange={(e) => setTempDesc(e.target.value)}
                  className="text-zinc-500 text-sm sm:text-base bg-zinc-800/50 border-zinc-700 h-auto py-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveDesc()
                    if (e.key === 'Escape') setEditingDesc(false)
                  }}
                />
                <Button onClick={handleSaveDesc} size="icon" variant="ghost" className="h-8 w-8 hover:bg-green-500/20 text-green-400 cursor-pointer shrink-0">
                  <CheckCircle className="h-4 w-4" />
                </Button>
                <Button onClick={() => setEditingDesc(false)} size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-500/20 text-red-400 cursor-pointer shrink-0">
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="group flex items-center gap-2 max-w-full w-fit">
                <p className="text-zinc-500 text-sm sm:text-base truncate">
                  {project.description || 'No description'}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 text-white/50 hover:text-white hover:bg-zinc-800/50 pointer-events-none group-hover:pointer-events-auto shrink-0"
                  onClick={() => {
                    setTempDesc(project.description || '')
                    setEditingDesc(true)
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-white/50">
          <div className={`font-medium px-2 py-0.5 rounded text-[10px] sm:text-xs ${
            project.status === 'ACTIVE' 
              ? 'bg-green-500/20 text-green-300' 
              : 'bg-gray-500/20 text-gray-300'
          }`}>
            {project.status === 'ACTIVE' ? 'Active' : 'Archived'}
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            Created {new Date(project.createdAt).toLocaleDateString()}
          </div>
          <span>•</span>
          <span>{project._count?.sessions ?? sessions.length} session{(project._count?.sessions ?? sessions.length) !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Start New Session Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
        <div className="rounded-2xl p-3 sm:p-4 md:p-5 border border-zinc-800 bg-[#111113] transition-all duration-300 flex flex-col h-full">
          <div className="space-y-3 flex-1 flex flex-col justify-center">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm sm:text-base text-white transition-colors">
                  Start New Session
                </h3>
                <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">
                  Enter a URL to instantly start Brand Sentiment, Competitors &amp; AI Share of Voice analysis
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2">
                <p className="text-red-300 text-[10px] sm:text-xs">{error}</p>
              </div>
            )}

            {/* Form */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isStartingCrawl && handleStartSession()}
                  className="bg-zinc-800/40 border-zinc-800 text-white placeholder:text-zinc-600 text-xs sm:text-sm h-8 sm:h-9 flex-1"
                  disabled={isStartingCrawl}
                />

                <Button
                  onClick={handleStartSession}
                  disabled={isStartingCrawl || !url.trim()}
                  className="bg-green-500 hover:bg-green-600 text-white rounded-md text-[10px] sm:text-xs h-8 sm:h-9 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 px-3 sm:px-4 shrink-0 transition-colors flex items-center justify-center gap-2"
                  type="button"
                >
                  {isStartingCrawl ? (
                    <>
                      <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin" />
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-current" />
                      <span className="font-medium">Start</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Crawl Sessions</h2>

        {isLoadingSessions ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => <TableRowSkeleton key={i} cols={4} className="rounded-sm border border-white/10 bg-[#0e0e0e] h-24" />)}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-sm border border-white/40 bg-[#0e0e0e] flex flex-col items-center justify-center py-16 text-center">
            <Globe className="h-12 w-12 text-white/15 mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">No sessions yet</h3>
            <p className="text-xs text-white/40">Start a new analysis above to see sessions here</p>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-2.5">
            {sessions.map((session: CrawlSession) => (
              <div
                key={session.id}
                className="w-full rounded-sm border border-white/10 bg-[#0e0e0e] hover:border-white/20 hover:bg-[#131313] transition-all duration-200 cursor-pointer"
                onClick={() => router.push(`/dashboard/projects/${projectId}/sessions/${session.id}`)}
              >
                {/* Top row: URL + actions */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-semibold text-blue-400/80 text-lg truncate" title={session.startUrl}>
                      {session.startUrl}
                    </span>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a
                      href={`/dashboard/projects/${projectId}/sessions/${session.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center h-7 px-2.5 text-xs text-white/50 hover:text-white/80 hover:bg-white/6 rounded-sm transition-colors cursor-pointer"
                    >
                      View
                    </a>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={deletingSessionId === session.id}
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id) }}
                      className="h-7 px-3 py-4 text-xs text-red-400/60 hover:text-red-300 hover:bg-red-500/8 focus-visible:ring-0 cursor-pointer rounded-sm disabled:cursor-not-allowed"
                    >
                      {deletingSessionId === session.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <><Trash2 className="h-3 w-3 mr-1.5" /> Delete</>
                      }
                    </Button>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/6" />

                {/* Metrics row */}
                <div className="flex items-end gap-12 px-5 pt-3 pb-4">
                  {/* Status */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/35 font-medium">Status</span>
                    <span className={`text-sm font-semibold capitalize ${
                      session.status === 'completed' ? 'text-emerald-400'
                      : session.status === 'running' || session.status === 'auditing' ? 'text-blue-400'
                      : session.status === 'failed' ? 'text-red-400'
                      : 'text-white/40'
                    }`}>
                      {session.status}
                    </span>
                  </div>

                  {/* Started at */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/35 font-medium">Started at</span>
                    <span className="text-sm font-semibold text-white">
                      {session.startedAt
                        ? new Date(session.startedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </span>
                  </div>

                  {/* Completed at / Duration */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/35 font-medium">Completed at</span>
                    <span className="text-sm font-semibold text-white">
                      {session.completedAt
                        ? new Date(session.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProjectEditDialog 
        project={projectToEdit}
        open={!!projectToEdit}
        onOpenChange={(open) => !open && setProjectToEdit(null)}
      />

      <ProjectDeleteDialog 
        project={projectToDelete}
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
        onSuccess={() => router.push('/dashboard/projects')}
      />

      {/* Promise-based confirm dialog (replaces window.confirm) */}
      {ConfirmUI}
    </div>
  )
}
