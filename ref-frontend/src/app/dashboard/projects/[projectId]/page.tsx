'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Clock, Globe, CheckCircle, XCircle, Loader2, AlertCircle, Play, Pencil, Trash2 } from 'lucide-react'
import { useGetProjectQuery, useUpdateProjectMutation, type Project } from '@/store/api/projectApi'
import { useGetProjectSessionsQuery, useCreateSessionMutation, useCreateJobMutation, useDeleteSessionMutation } from '@/store/api/sessionApi'
import { ProjectEditDialog } from '@/components/dashboard/ProjectEditDialog'
import { ProjectDeleteDialog } from '@/components/dashboard/ProjectDeleteDialog'
import { useNdConfirm, NdConfirmDialog } from '@/components/dashboard/ui/nd-confirm-dialog'
import { ProjectDetailSkeleton, TableRowSkeleton } from '@/components/ui/PageLoader'
import type { CrawlSession } from '@/store/api/sessionApi'

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  const { data: projectData, isLoading: isLoadingProject, error: projectError } = useGetProjectQuery(projectId, { refetchOnMountOrArgChange: true })
  const { data: sessionsData, isLoading: isLoadingSessions } = useGetProjectSessionsQuery({ projectId }, { refetchOnMountOrArgChange: true })
  const [createSession, { isLoading: isCreatingSession }] = useCreateSessionMutation()
  const [createJob, { isLoading: isCreatingJob }] = useCreateJobMutation()
  const [deleteSession] = useDeleteSessionMutation()
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [updateProject] = useUpdateProjectMutation()
  const { confirm, ConfirmUI } = useNdConfirm()

  const [editingName, setEditingName] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [tempName, setTempName] = useState('')
  const [tempDesc, setTempDesc] = useState('')
  const [projectToEdit] = useState<Project | null>(null)
  const [projectToDelete] = useState<Project | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isStartingCrawl = isCreatingSession || isCreatingJob

  const handleSaveName = async () => {
    if (!tempName.trim()) return
    try { await updateProject({ projectId, data: { name: tempName } }).unwrap(); setEditingName(false) }
    catch (err) { console.error(err) }
  }

  const handleSaveDesc = async () => {
    try { await updateProject({ projectId, data: { description: tempDesc } }).unwrap(); setEditingDesc(false) }
    catch (err) { console.error(err) }
  }

  const handleDeleteSession = async (sessionId: string) => {
    const ok = await confirm({ title: 'Delete session?', description: 'This will permanently remove all session data.', confirmLabel: 'Delete session', destructive: true })
    if (!ok) return
    setDeletingSessionId(sessionId)
    try { await deleteSession(sessionId).unwrap() } catch (err) { console.error(err) } finally { setDeletingSessionId(null) }
  }

  const handleStartSession = async () => {
    if (!url.trim()) { setError('Please enter a URL'); return }
    setError(null)
    try {
      const sessionResult = await createSession(projectId).unwrap()
      const sessionId = sessionResult.session.id
      const normalizedUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`
      const jobResult = await createJob({ sessionId, data: { url: normalizedUrl, jobType: 'MODULE_E_QUICK_START' } }).unwrap()
      const progressParams = new URLSearchParams({ projectId, sessionId, url: normalizedUrl, showBrandOnboarding: '1', ...(jobResult.job.isCacheHit ? { cacheHit: '1' } : {}) })
      router.replace(`/dashboard/jobs/${jobResult.job.id}/progress?${progressParams.toString()}`)
    } catch (err: any) { setError(err?.data?.message || 'Failed to start session') }
  }

  if (isLoadingProject) return <ProjectDetailSkeleton />

  if (projectError || !projectData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-16 w-16 text-red-400 mb-4" />
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--nd-text-primary)' }}>Project not found</h2>
        <p className="mb-4" style={{ color: 'var(--nd-text-secondary)' }}>The project does not exist or was deleted.</p>
        <button onClick={() => router.push('/dashboard/projects')} className="nd-btn-primary cursor-pointer" style={{ background: 'var(--nd-purple)' }}>Back to Projects</button>
      </div>
    )
  }

  const project = projectData.project
  const sessions = sessionsData?.sessions || []

  const sessionCount = project._count?.sessions ?? sessions.length

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in-hero">
      {/* Header */}
      <div className="space-y-2">
        {/* Name */}
        <div className="min-h-10 flex items-center">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <input value={tempName} onChange={(e) => setTempName(e.target.value)} className="text-2xl sm:text-3xl font-bold h-auto py-1 rounded-xl flex-1 border px-3 outline-none" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }} />
              <button onClick={handleSaveName} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-emerald-50 text-emerald-600 cursor-pointer"><CheckCircle className="h-5 w-5" /></button>
              <button onClick={() => setEditingName(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-500 cursor-pointer"><XCircle className="h-5 w-5" /></button>
            </div>
          ) : (
            <div className="group flex items-center gap-2 max-w-full w-fit">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold truncate" style={{ color: 'var(--nd-text-primary)' }}>{project.name}</h1>
              <button className="opacity-0 group-hover:opacity-100 h-8 w-8 flex items-center justify-center rounded-lg pointer-events-none group-hover:pointer-events-auto cursor-pointer" style={{ color: 'var(--nd-text-muted)' }} onClick={() => { setTempName(project.name); setEditingName(true) }}><Pencil className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="min-h-6 flex items-center">
          {editingDesc ? (
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <input value={tempDesc} onChange={(e) => setTempDesc(e.target.value)} className="text-sm h-auto py-1 rounded-xl flex-1 border px-3 outline-none" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDesc(); if (e.key === 'Escape') setEditingDesc(false) }} />
              <button onClick={handleSaveDesc} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-emerald-50 text-emerald-600 cursor-pointer"><CheckCircle className="h-4 w-4" /></button>
              <button onClick={() => setEditingDesc(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-500 cursor-pointer"><XCircle className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="group flex items-center gap-2 max-w-full w-fit">
              <p className="text-sm sm:text-base truncate" style={{ color: 'var(--nd-text-secondary)' }}>{project.description || 'No description'}</p>
              <button className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded-md pointer-events-none group-hover:pointer-events-auto cursor-pointer" style={{ color: 'var(--nd-text-muted)' }} onClick={() => { setTempDesc(project.description || ''); setEditingDesc(true) }}><Pencil className="h-3 w-3" /></button>
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs" style={{ color: 'var(--nd-text-muted)' }}>
          <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${project.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-[#F5F5FA] text-[#9DA3B3]'}`}>{project.status === 'ACTIVE' ? 'Active' : 'Archived'}</span>
          <span>•</span>
          <div className="flex items-center gap-1"><Clock className="h-3 w-3" />Created {new Date(project.createdAt).toLocaleDateString()}</div>
          <span>•</span>
          <span>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Start New Session */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-2xl p-4 sm:p-5 border flex flex-col" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
          <h3 className="font-semibold text-sm sm:text-base mb-1" style={{ color: 'var(--nd-text-primary)' }}>Start New Session</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--nd-text-secondary)' }}>Enter a URL to start Brand Sentiment, Competitors &amp; AI Share of Voice analysis</p>
          {error && (<div className="rounded-lg bg-red-50 border border-red-200 p-2 mb-3"><p className="text-red-600 text-xs">{error}</p></div>)}
          <div className="flex gap-2">
            <input id="url" type="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isStartingCrawl && handleStartSession()} className="text-xs sm:text-sm h-9 rounded-lg flex-1 border px-3 outline-none" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }} disabled={isStartingCrawl} />
            <button onClick={handleStartSession} disabled={isStartingCrawl || !url.trim()} className="text-white rounded-lg text-xs h-9 px-4 shrink-0 cursor-pointer disabled:cursor-not-allowed font-semibold inline-flex items-center gap-1 disabled:opacity-50" style={{ background: 'var(--nd-purple)' }} type="button">
              {isStartingCrawl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Play className="h-3.5 w-3.5 fill-current mr-1" /> Start</>}
            </button>
          </div>
        </div>
      </div>

      {/* Sessions */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold" style={{ color: 'var(--nd-text-primary)' }}>Crawl Sessions</h2>
        {isLoadingSessions ? (
          <div className="flex flex-col gap-2">{[1,2,3].map((i) => <TableRowSkeleton key={i} cols={4} className="rounded-2xl border h-24" />)}</div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border flex flex-col items-center justify-center py-16 text-center" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
            <Globe className="h-12 w-12 mb-3" style={{ color: 'var(--nd-text-muted)' }} />
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--nd-text-primary)' }}>No sessions yet</h3>
            <p className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>Start a new analysis above</p>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-2.5">
            {sessions.map((session: CrawlSession) => (
              <div key={session.id} className="w-full rounded-2xl border cursor-pointer transition-all duration-200 hover:shadow-sm" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}
                onClick={() => router.push(`/dashboard/projects/${projectId}/sessions/${session.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border)')}
              >
                <div className="flex items-center justify-between px-5 pt-4 pb-3">
                  <span className="font-semibold text-lg truncate" style={{ color: 'var(--nd-purple)' }} title={session.startUrl}>{session.startUrl}</span>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <a href={`/dashboard/projects/${projectId}/sessions/${session.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center h-7 px-2.5 text-xs rounded-lg font-medium cursor-pointer" style={{ color: 'var(--nd-text-secondary)' }}>View</a>
                    <button disabled={deletingSessionId === session.id} onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id) }} className="h-7 px-2.5 text-xs text-red-500 hover:bg-red-50 rounded-lg cursor-pointer disabled:cursor-not-allowed inline-flex items-center">
                      {deletingSessionId === session.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Trash2 className="h-3 w-3 mr-1.5" />Delete</>}
                    </button>
                  </div>
                </div>
                <div className="h-px" style={{ background: 'var(--nd-border)' }} />
                <div className="flex items-end gap-10 px-5 pt-3 pb-4">
                  {[
                    { label: 'Status', value: session.status, color: session.status === 'completed' ? '#059669' : session.status === 'running' || session.status === 'auditing' ? '#2563EB' : session.status === 'failed' ? '#EF4444' : undefined },
                    { label: 'Started at', value: session.startedAt ? new Date(session.startedAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—' },
                    { label: 'Completed at', value: session.completedAt ? new Date(session.completedAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium" style={{ color: 'var(--nd-text-muted)' }}>{label}</span>
                      <span className="text-sm font-semibold capitalize" style={{ color: color ?? 'var(--nd-text-primary)' }}>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProjectEditDialog project={projectToEdit} open={!!projectToEdit} onOpenChange={() => {}} />
      <ProjectDeleteDialog project={projectToDelete} open={!!projectToDelete} onOpenChange={() => {}} onSuccess={() => router.push('/dashboard/projects')} />
      {ConfirmUI}
    </div>
  )
}
