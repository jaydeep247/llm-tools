'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Clock, Globe, CheckCircle, XCircle, Loader2, AlertCircle, Play, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useGetProjectQuery, useUpdateProjectMutation, type Project } from '@/store/api/projectApi'
import { useGetProjectSessionsQuery, useCreateSessionMutation, useCreateJobMutation, useDeleteSessionMutation } from '@/store/api/sessionApi'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ProjectEditDialog } from '@/components/dashboard/ProjectEditDialog'
import type { CrawlSession } from '@/store/api/sessionApi'
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider'

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const { confirm } = useGlobalDialog()

  const { data: projectData, isLoading: isLoadingProject, error: projectError } = useGetProjectQuery(projectId, { refetchOnMountOrArgChange: true })
  const { data: sessionsData, isLoading: isLoadingSessions } = useGetProjectSessionsQuery({ projectId }, { refetchOnMountOrArgChange: true })
  const [createSession, { isLoading: isCreatingSession }] = useCreateSessionMutation()
  const [createJob, { isLoading: isCreatingJob }] = useCreateJobMutation()
  const [deleteSession] = useDeleteSessionMutation()
  const [updateProject] = useUpdateProjectMutation()

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
    const isConfirmed = await confirm({
      title: 'Delete Session',
      description: 'Are you sure you want to delete this session? This action cannot be undone.',
      confirmText: 'Delete',
      variant: 'destructive',
    })

    if (isConfirmed) {
        try {
            await deleteSession(sessionId).unwrap()
        } catch (err) {
            console.error('Failed to delete session', err)
        }
    }
  }


  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)

  const isStartingCrawl = isCreatingSession || isCreatingJob

  // Form state
  const [url, setUrl] = useState('')
  const [allowSubdomains, setAllowSubdomains] = useState(true)
  const [runAudits, setRunAudits] = useState(false)
  const [auditDevice, setAuditDevice] = useState<'mobile' | 'desktop'>('desktop')
  const [captureLinkDetails, setCaptureLinkDetails] = useState(true)
  const [error, setError] = useState<string | null>(null)

  if (isLoadingProject) {
    return (
      <div className="space-y-6 sm:space-y-8 animate-fade-in-hero">
        <div className="space-y-2">
          <div className="h-8 sm:h-10 md:h-12 w-48 sm:w-64 bg-white/10 rounded animate-pulse"></div>
          <div className="h-4 sm:h-5 w-32 sm:w-48 bg-white/10 rounded animate-pulse"></div>
        </div>
      </div>
    )
  }

  if (projectError || !projectData) {
    return (
      <div className="space-y-8 animate-fade-in-hero">
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-16 w-16 text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Project not found</h2>
          <p className="text-white/60 mb-4">The project you're looking for doesn't exist</p>
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
        return 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
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

       const normalizedUrl = normalizeUrl(url)

      // Step 2: Create job
      await createJob({
        sessionId,
        data: {
          url: normalizedUrl,
          allowSubdomains,
          runAudits,
          auditDevice,
          captureLinkDetails,
        }
      }).unwrap()

      // Navigate to session details page (which defaults to crawler tab/view)
      router.push(`/dashboard/projects/${projectId}/sessions/${sessionId}`)
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Failed to start crawl session')
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
                  className="text-2xl sm:text-3xl md:text-4xl font-bold text-white bg-white/10 border-white/20 h-auto py-1"
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
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 pointer-events-none group-hover:pointer-events-auto shrink-0"
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
                  className="text-white/60 text-sm sm:text-base bg-white/10 border-white/20 h-auto py-1"
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
                <p className="text-white/60 text-sm sm:text-base truncate">
                  {project.description || 'No description'}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 text-white/50 hover:text-white hover:bg-white/10 pointer-events-none group-hover:pointer-events-auto shrink-0"
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
        <div className="rounded-lg p-3 sm:p-4 md:p-5 border border-white/20 bg-white/10 backdrop-blur-xl transition-all duration-500 flex flex-col h-full">
          <div className="space-y-3 flex-1 flex flex-col justify-center">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm sm:text-base text-white transition-colors">
                  Start New Session
                </h3>
                <p className="text-[10px] sm:text-xs text-white/60 mt-0.5">
                  Enter a URL to begin crawling and analysis
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2">
                <p className="text-red-300 text-[10px] sm:text-xs">{error}</p>
              </div>
            )}

            {/* Form */}
            <div className="flex gap-2">
              <Input
                id="url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isStartingCrawl && handleStartSession()}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-xs sm:text-sm h-8 sm:h-9 flex-1"
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

      {/* Sessions List */}
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">Crawl Sessions</h2>
        
        {isLoadingSessions ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg p-3 sm:p-4 md:p-5 border border-white/20 bg-white/10 backdrop-blur-xl animate-pulse">
                <div className="h-20 sm:h-24 bg-white/10 rounded"></div>
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-lg p-8 sm:p-10 md:p-12 border border-white/20 bg-white/10 backdrop-blur-xl text-center">
            <Globe className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-white/40 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white mb-1.5 sm:mb-2">No sessions yet</h3>
            <p className="text-xs sm:text-sm text-white/60 mb-4 sm:mb-6">Start a new crawl to see sessions here</p>
            <Button 
              onClick={() => router.push('/dashboard')}
              className="bg-white text-black hover:bg-slate-100 rounded-full text-sm cursor-pointer"
            >
              Start Crawling
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {sessions.map((session: CrawlSession) => (
              <div
                key={session.id}
                className="rounded-lg p-3 sm:p-4 md:p-5 border border-white/20 bg-white/10 backdrop-blur-xl transition-all duration-500 flex flex-col"
              >
                <div className="flex flex-col h-full">
                  {/* Top Meta: Date and Status */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] sm:text-xs text-white/50">
                      Started: {session.startedAt ? new Date(session.startedAt).toLocaleDateString() : 'N/A'}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge 
                        className={`${getStatusColor(session.status)} px-3 py-1 text-[10px] uppercase tracking-wider font-semibold border rounded-full transition-colors`}
                      >
                        {session.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-white/40 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeleteSession(session.id);
                        }}
                        title="Delete Session"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Title (Start URL) */}
                  <div className="mb-6">
                    <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-white/90 transition-colors truncate" title={session.startUrl}>
                      {session.startUrl}
                    </h3>
                  </div>

                  {/* Key Stats Row */}
                  <div className="grid grid-cols-4 gap-2 mb-6">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Pages</span>
                      <span className="text-lg sm:text-xl font-bold text-white">{session.totalPages}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Links</span>
                      <span className="text-lg sm:text-xl font-bold text-white">{session.totalLinks}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Sitemaps</span>
                      <span className="text-lg sm:text-xl font-bold text-white">{session.totalSitemaps}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Threads</span>
                      <span className="text-lg sm:text-xl font-bold text-white">{session.maxConcurrency}</span>
                    </div>
                  </div>

                  {/* Tags / Config Section */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] text-white/70">
                      Subdomains: <span className={session.allowSubdomains ? 'text-green-400' : 'text-red-400'}>{session.allowSubdomains ? 'Yes' : 'No'}</span>
                    </div>
                    {session.completedAt && (
                      <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] text-white/70">
                        Duration: {Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt || 0).getTime()) / 1000)}s
                      </div>
                    )}
                    <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] text-white/70">
                      Resources: {session.totalResources}
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div className="mt-auto">
                    <a
                      href={session.status === 'running' || session.status === 'auditing' 
                        ? `/dashboard/projects/${projectId}/sessions/${session.id}/progress`
                        : `/dashboard/projects/${projectId}/sessions/${session.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full py-2 bg-white text-black text-xs font-semibold rounded text-center opacity-90 hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      View Full Session
                    </a>
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
    </div>
  )
}
