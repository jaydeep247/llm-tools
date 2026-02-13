'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, TrendingUp, Users, Zap, FolderOpen, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// import { useStartCrawlMutation } from '@/store/api/module_A/crawlApi'
import { useGetProjectsQuery } from '@/store/api'
import { useToast } from '@/hooks/use-toast'
import { AuthModal } from '@/components/auth/auth-modal'
import { ProjectSelectorDialog } from '@/components/dashboard/ProjectSelectorDialog'
import { useAuth } from '@/hooks/useAuth'

export default function DashboardPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { isAuthenticated, refreshAuth } = useAuth()
  // Mock removed mutation
  const startCrawl = (args: any) => ({ unwrap: async () => ({ sessionId: null }) })
  const isCrawling = false
  // const [startCrawl, { isLoading: isCrawling }] = useStartCrawlMutation()
  const { data: projectsData } = useGetProjectsQuery()
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [pendingUrl, setPendingUrl] = useState('')

  const handleAnalyzeClick = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    // Check if user is authenticated
    if (!isAuthenticated) {
      setPendingUrl(url)
      setIsAuthModalOpen(true)
      return
    }

    // Show project selector dialog
    setPendingUrl(url)
    setIsProjectSelectorOpen(true)
  }

  const handleProjectSelect = async (projectId: string) => {
    try {
      const result = await startCrawl({
        projectId: projectId,
        url: pendingUrl,
        allowSubdomains: true,
        runAudits: false,
        auditDevice: 'desktop',
        captureLinkDetails: true,
      }).unwrap()

      toast({
        title: 'Crawl Started',
        description: `Successfully started crawling ${pendingUrl}`,
      })

      // Navigate to the session progress page if sessionId is returned
      if (result.sessionId) {
        router.push(`/dashboard/projects/${projectId}/sessions/${result.sessionId}/progress`)
      }
    } catch (error: any) {
      toast({
        title: 'Failed to Start Crawl',
        description: error?.data?.message || 'An error occurred while starting the crawl',
        variant: 'destructive',
      })
    }
  }

  const handleAuthSuccess = () => {
    refreshAuth()
    // After successful auth, show project selector if there was a pending URL
    if (pendingUrl) {
      setIsProjectSelectorOpen(true)
    }
  }

  const totalProjects = projectsData?.projects?.length || 0

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white text-balance">
          Welcome back to your{' '}
          <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-slate-200">
            Dashboard
          </span>
        </h1>
        <p className="text-white/70 text-sm sm:text-base md:text-lg lg:text-xl font-light">
          Manage your projects, subscriptions, and API usage all in one place
        </p>
      </div>

      {/* Crawl Form Section */}
      <div className="rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 lg:p-8 border border-white/20 bg-white/10 backdrop-blur-xl">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">Start New Crawl</h2>
        <form onSubmit={handleAnalyzeClick} className="space-y-3 md:space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter website URL (e.g., yogreet.com or https://yogreet.com)"
              className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 rounded-xl"
              required
            />
            <Button
              type="submit"
              disabled={isCrawling || !url.trim()}
              className="bg-white text-black hover:bg-slate-100 rounded-xl px-6 font-semibold cursor-pointer disabled:cursor-not-allowed"
            >
              {isCrawling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-white/60">
            {isAuthenticated 
              ? 'Click Analyze to select a project and start crawling'
              : 'Sign in to start analyzing websites'
            }
          </p>
        </form>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
        {/* Total Projects Card */}
        <button 
          onClick={() => router.push('/dashboard/projects')}
          className="group rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 cursor-pointer text-left"
        >
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-white/70">Total Projects</span>
              <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1 md:space-y-2">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{totalProjects}</p>
              <p className="text-[10px] sm:text-xs text-white/60 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-white/80" />
                Click to manage
              </p>
            </div>
          </div>
        </button>

        {/* Current Plan Card */}
        <div className="group rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 cursor-pointer">
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-white/70">Current Plan</span>
              <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1 md:space-y-2">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">Pro</p>
              <p className="text-[10px] sm:text-xs text-white/60">Renews on Dec 15, 2024</p>
            </div>
          </div>
        </div>

        {/* API Usage Card */}
        <div className="group rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 cursor-pointer">
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-white/70">API Usage</span>
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-2 md:space-y-3">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">45%</p>
              <div className="w-full bg-white/10 rounded-full h-1.5 md:h-2 overflow-hidden">
                <div className="bg-white/60 h-full rounded-full w-[45%]" />
              </div>
              <p className="text-[10px] sm:text-xs text-white/60">Of monthly quota</p>
            </div>
          </div>
        </div>

        {/* Team Members Card */}
        <div className="group rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 cursor-pointer">
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-white/70">Team Members</span>
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white/60 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1 md:space-y-2">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">5</p>
              <p className="text-[10px] sm:text-xs text-white/60">Active members</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Projects Section */}
      <div className="space-y-3 md:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">Recent Projects</h2>
          <Button 
            onClick={() => router.push('/dashboard/projects')}
            className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-xs sm:text-sm px-3 sm:px-4 md:px-6 h-8 sm:h-9 md:h-10"
          >
            View All
            <ArrowRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {projectsData?.projects?.slice(0, 4).map((project) => (
            <button
              key={project.id}
              onClick={() => router.push(`/dashboard/projects/${project.id}`)}
              className="rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 text-left"
            >
              <div className="space-y-3 md:space-y-4">
                <h3 className="text-base sm:text-lg font-semibold text-white">{project.name}</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-xs font-medium px-2 sm:px-3 py-1 rounded-full bg-white/20 text-white">
                      {project.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-[10px] sm:text-xs text-white/60">
                      {project._count?.crawlSessions || 0} sessions
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-white/60 line-clamp-2">
                    {project.description || 'No description'}
                  </p>
                </div>
              </div>
            </button>
          )) || (
            <div className="col-span-2 rounded-xl md:rounded-2xl p-8 sm:p-10 md:p-12 border border-white/20 bg-white/10 backdrop-blur-xl text-center">
              <FolderOpen className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-white/40 mx-auto mb-3 md:mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">No projects yet</h3>
              <p className="text-sm sm:text-base text-white/60 mb-4 md:mb-6">Create your first project to get started</p>
              <Button 
                onClick={() => router.push('/dashboard/projects')}
                className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-sm"
              >
                Create Project
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3 md:space-y-4">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <button 
            onClick={() => router.push('/dashboard/projects')}
            className="rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 text-left group"
          >
            <div className="space-y-1.5 md:space-y-2">
              <p className="text-base sm:text-lg font-semibold text-white group-hover:text-white/90">+ New Project</p>
              <p className="text-xs sm:text-sm text-white/60">Create a new project to organize your crawls</p>
            </div>
          </button>
          <button 
            onClick={() => router.push('/dashboard/usage')}
            className="rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl hover:border-white/30 hover:bg-white/15 transition-all duration-500 text-left group"
          >
            <div className="space-y-1.5 md:space-y-2">
              <p className="text-base sm:text-lg font-semibold text-white group-hover:text-white/90">View Usage</p>
              <p className="text-xs sm:text-sm text-white/60">Check your API usage and quota</p>
            </div>
          </button>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Project Selector Dialog */}
      <ProjectSelectorDialog
        isOpen={isProjectSelectorOpen}
        onClose={() => {
          setIsProjectSelectorOpen(false)
          setPendingUrl('')
        }}
        onSelectProject={handleProjectSelect}
        defaultUrl={pendingUrl}
      />
    </div>
  )
}
