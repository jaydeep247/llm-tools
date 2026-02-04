'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Clock, Globe, CheckCircle, XCircle, Loader2, AlertCircle, Play } from 'lucide-react'
import { useGetProjectQuery, useGetProjectSessionsQuery, useStartCrawlMutation } from '@/store/api'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { CrawlSession } from '@/store/api/projectApi'

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  const { data: projectData, isLoading: isLoadingProject, error: projectError } = useGetProjectQuery(projectId)
  const { data: sessionsData, isLoading: isLoadingSessions } = useGetProjectSessionsQuery({ projectId })
  const [startCrawl, { isLoading: isStartingCrawl }] = useStartCrawlMutation()

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'running':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'auditing':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30'
      default:
        return 'bg-white/10 text-white/60 border-white/20'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
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
      const result = await startCrawl({
        url: url.trim(),
        projectId,
        allowSubdomains,
        runAudits,
        auditDevice,
        captureLinkDetails,
      }).unwrap()

      // Navigate to session progress page
      if (result.sessionId) {
        router.push(`/dashboard/projects/${projectId}/sessions/${result.sessionId}/progress`)
      }
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Failed to start crawl session')
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in-hero">
      {/* Header */}
      <div className="space-y-2 sm:space-y-3">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{project.name}</h1>
        <p className="text-white/60 text-sm sm:text-base">
          {project.description || 'No description'}
        </p>
        <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-white/50">
          <div className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            Created {new Date(project.createdAt).toLocaleDateString()}
          </div>
          <span>•</span>
          <span>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Start New Session Card */}
      <div className="group rounded-lg p-3 sm:p-4 md:p-5 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 flex flex-col cursor-pointer">
        <div className="space-y-2 md:space-y-3 flex-1">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm sm:text-base text-white group-hover:text-white/90 transition-colors">
                Start New Session
              </h3>
              <p className="text-[10px] sm:text-xs text-white/60 mt-0.5">
                Enter a URL to begin crawling and analysis
              </p>
              <p className="text-[9px] sm:text-[10px] text-white/40 mt-1">
                Includes: Crawl, AEO Analysis, Page Metrics, Text Quality, AI Intelligence, Content Metrics, Answer Completeness, Entity Extractor
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2">
              <p className="text-red-300 text-[10px] sm:text-xs">{error}</p>
            </div>
          )}

          {/* Form */}
          <div className="space-y-1.5 md:space-y-2">
            <Input
              id="url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isStartingCrawl && handleStartSession()}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-xs sm:text-sm h-8 sm:h-9"
              disabled={isStartingCrawl}
            />

            <Button
              onClick={handleStartSession}
              disabled={isStartingCrawl || !url.trim()}
              className="w-full bg-white text-black hover:bg-slate-100 rounded-md text-[10px] sm:text-xs h-8 sm:h-9 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStartingCrawl ? (
                <>
                  <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1.5 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1.5" />
                  Start Crawl
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">Crawl Sessions</h2>
        
        {isLoadingSessions ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {sessions.map((session: CrawlSession) => (
              <a
                key={session.id}
                href={session.status === 'running' || session.status === 'auditing' 
                  ? `/dashboard/projects/${projectId}/sessions/${session.id}/progress`
                  : `/dashboard/projects/${projectId}/sessions/${session.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg p-3 sm:p-4 md:p-5 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 cursor-pointer flex flex-col"
              >
                <div className="space-y-2 md:space-y-3 flex-1">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/60 shrink-0" />
                        <h3 className="font-semibold text-sm sm:text-base text-white group-hover:text-white/90 transition-colors truncate">
                          {session.startUrl}
                        </h3>
                      </div>
                    </div>
                    <Badge 
                      className={`${getStatusColor(session.status)} flex items-center gap-1 px-2 py-0.5 text-[9px] sm:text-[10px] shrink-0`}
                    >
                      {getStatusIcon(session.status)}
                      {session.status}
                    </Badge>
                  </div>

                  {/* Stats */}
                  <div className="space-y-1.5 md:space-y-2">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs">
                      <span className="text-white/60">Pages Crawled</span>
                      <span className="text-white font-semibold">{session.totalPages}</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-[10px] sm:text-xs">
                      <span className="text-white/60">Resources Found</span>
                      <span className="text-white font-semibold">{session.totalResources}</span>
                    </div>
                    
                    <div className="flex items-center text-[9px] sm:text-[10px] text-white/50 pt-1">
                      <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                      Started {new Date(session.startedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
