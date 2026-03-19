'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import RotatingText from "../animations/RotatingText"
import { ProjectSelectorDialog } from '@/components/dashboard/ProjectSelectorDialog'
import { useCreateSessionMutation, useCreateJobMutation } from '@/store/api/sessionApi'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/useAuth'

const ArrowRight = () => (
  <svg
    className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const Play = () => (
  <svg
    className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6-8h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2z"
    />
  </svg>
)

export function HeroSection() {
  const router = useRouter()
  const { toast } = useToast()
  const { isAuthenticated } = useAuth()
  const [createSession, { isLoading: isCreatingSession }] = useCreateSessionMutation()
  const [createJob, { isLoading: isCreatingJob }] = useCreateJobMutation()
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [pendingUrl, setPendingUrl] = useState('')

  const handleAnalyzeClick = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    // Check if user is authenticated
    if (!isAuthenticated) {
      // Instead of opening modal, set a cookie or query param if we want to remember the URL, 
      // but for now let's just redirect to signin.
      router.push('/signin')
      return
    }

    // Show project selector dialog
    setPendingUrl(url)
    setIsProjectSelectorOpen(true)
  }

  const handleProjectSelect = async (projectId: string) => {
    try {
      const sessionResult = await createSession(projectId).unwrap()
      const sessionId = sessionResult.session.id

      const normalizedUrl = pendingUrl.trim().startsWith('http') ? pendingUrl.trim() : `https://${pendingUrl.trim()}`

      const jobResult = await createJob({
        sessionId,
        data: { url: normalizedUrl, jobType: 'MODULE_E_QUICK_START' },
      }).unwrap()

      toast({
        title: 'Analysis Started',
        description: `Analyzing ${pendingUrl}`,
      })

      // Navigate to progress page — it auto-redirects to dashboard on completion
      router.push(`/dashboard/jobs/${jobResult.job.id}/progress`)
    } catch (error: any) {
      toast({
        title: 'Failed to Start Session',
        description: error?.data?.message || 'An error occurred while starting the session',
        variant: 'destructive',
      })
    }
  }

  return (
    <section className="min-h-screen flex items-center justify-center px-4 py-20 relative">
      <div className="max-w-4xl mx-auto text-center relative z-10 animate-fade-in-hero">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-medium mb-8 mt-12 animate-fade-in-badge">
          <span className="w-2 h-2 bg-white/60 rounded-full mr-2 animate-pulse"></span>
          Enterprise SEO & AEO Intelligence Platform
        </div>

        {/* Main Heading */}
        <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-balance mb-6 animate-fade-in-heading">
          <span className="text-foreground">Unlock Complete</span>
          <br />
          <span className="inline-flex items-center justify-center flex-wrap gap-2 mt-4 sm:mt-6 md:mt-8">
            <span className="text-foreground">Website</span>
            <RotatingText
              texts={["Intelligence", "SEO Insights", "AEO Analysis", "Performance", "Optimization"]}
              mainClassName="px-2 sm:px-2 md:px-3 bg-white text-black overflow-hidden py-1 sm:py-1 md:py-2 justify-center rounded-lg shadow-lg"
              staggerFrom={"last"}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-120%" }}
              staggerDuration={0.025}
              splitLevelClassName="overflow-hidden pb-1 sm:pb-1 md:pb-1"
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              rotationInterval={2000}
            />
          </span>
        </h1>

        {/* Subheading */}
        <p className="text-base sm:text-xl md:text-2xl text-white text-balance max-w-sm sm:max-w-3xl mx-auto mb-8 sm:mb-12 leading-relaxed px-4 sm:px-0 animate-fade-in-subheading font-light">
          Enterprise web crawler with AI-powered SEO/AEO analysis, Schema.org generation, and competitive intelligence.
        </p>

        {/* URL Input Field */}
        <div className="max-w-2xl mx-auto mb-8 sm:mb-12 animate-fade-in-buttons px-4">
          <form onSubmit={handleAnalyzeClick} className="flex flex-col sm:flex-row items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full p-1.5">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter website URL"
              className="flex-1 w-full px-5 py-3 bg-white text-slate-900 rounded-full text-sm md:text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/50"
              required
            />
            <button 
              type="submit"
              disabled={isCreatingSession || isCreatingJob || !url.trim()}
              className="w-full sm:w-auto px-6 py-3 bg-white text-slate-900 rounded-full font-semibold text-sm md:text-base hover:bg-slate-50 transition-all duration-300 hover:scale-105 shadow-lg whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isCreatingSession || isCreatingJob ? 'Analyzing...' : 'Analyze'}
            </button>
          </form>
        </div>

        {/* Trust Indicators */}
        <div className="text-center px-4 hidden sm:block overflow-hidden animate-fade-in-trust">
          <p className="text-sm text-white mb-6">Trusted by digital marketers and SEO professionals worldwide</p>
          <div className="relative overflow-hidden w-full max-w-4xl mx-auto">
            <div className="flex items-center gap-8 opacity-60 hover:opacity-80 transition-all duration-500 animate-slide-left">
              <div className="flex items-center gap-8 whitespace-nowrap">
                <div className="text-base sm:text-lg font-semibold">ContentPro</div>
                <div className="text-base sm:text-lg font-semibold">SEOMasters</div>
                <div className="text-base sm:text-lg font-semibold">DataInsight</div>
                <div className="text-base sm:text-lg font-semibold">WebOptimize</div>
                <div className="text-base sm:text-lg font-semibold">AnalyticHub</div>
                <div className="text-base sm:text-lg font-semibold">SearchFlow</div>
              </div>
              {/* Duplicate for seamless loop */}
              <div className="flex items-center gap-8 whitespace-nowrap">
                <div className="text-base sm:text-lg font-semibold">ContentPro</div>
                <div className="text-base sm:text-lg font-semibold">SEOMasters</div>
                <div className="text-base sm:text-lg font-semibold">DataInsight</div>
                <div className="text-base sm:text-lg font-semibold">WebOptimize</div>
                <div className="text-base sm:text-lg font-semibold">AnalyticHub</div>
                <div className="text-base sm:text-lg font-semibold">SearchFlow</div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Trust Indicators */}
        <div className="text-center px-4 mb-8 sm:hidden overflow-hidden animate-fade-in-trust">
          <p className="text-sm text-white mb-6">Trusted by digital marketers and SEO professionals worldwide</p>
          <div className="relative overflow-hidden w-full max-w-sm mx-auto">
            {/* Left blur fade */}
            <div className="absolute left-0 top-0 w-8 h-full bg-linear-to-r from-black to-transparent z-10 pointer-events-none"></div>
            {/* Right blur fade */}
            <div className="absolute right-0 top-0 w-8 h-full bg-linear-to-l from-black to-transparent z-10 pointer-events-none"></div>
            <div className="flex items-center gap-6 opacity-60 animate-slide-left-mobile">
              <div className="flex items-center gap-6 whitespace-nowrap">
                <div className="text-sm font-semibold">ContentPro</div>
                <div className="text-sm font-semibold">SEOMasters</div>
                <div className="text-sm font-semibold">DataInsight</div>
                <div className="text-sm font-semibold">WebOptimize</div>
                <div className="text-sm font-semibold">AnalyticHub</div>
                <div className="text-sm font-semibold">SearchFlow</div>
              </div>
              {/* Duplicate for seamless loop */}
              <div className="flex items-center gap-6 whitespace-nowrap">
                <div className="text-sm font-semibold">ContentPro</div>
                <div className="text-sm font-semibold">SEOMasters</div>
                <div className="text-sm font-semibold">DataInsight</div>
                <div className="text-sm font-semibold">WebOptimize</div>
                <div className="text-sm font-semibold">AnalyticHub</div>
                <div className="text-sm font-semibold">SearchFlow</div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </section>
  )
}
