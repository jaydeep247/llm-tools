
'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateUserMutation } from '@/store/api/userApi'
import { useCreateProjectMutation } from '@/store/api/projectApi'
import { useCreateSessionMutation, useCreateJobMutation } from '@/store/api/sessionApi'
import { useToast } from '@/hooks/use-toast'
import { AnimatePresence } from 'framer-motion'

import { OnboardingLayout } from '@/components/onboarding/layout'
import { StepWelcome } from '@/components/onboarding/steps/step-welcome'
import { StepCreateProject } from '@/components/onboarding/steps/step-create-project'
import { StepStartSession } from '@/components/onboarding/steps/step-start-session'
import { StepConnectAnalytics } from '@/components/onboarding/steps/step-connect-analytics'

const TOTAL_STEPS = 4

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

/** Key used to persist brand-onboarding redirect params across the GA OAuth round-trip */
const GA_REDIRECT_PARAMS_KEY = 'onboarding_brand_params'

interface BrandRedirectParams {
  projectId: string
  url: string
  sessionId: string
  jobId: string
}

const LEFT_PANEL_CONTENT = [
  { // 0: Welcome
    title: "Get powerful insights from your project data — instantly.",
    description: "From schedule delays to risk predictions — Contentlytics gives you clarity in minutes, not days.",
    testimonial: {
      quote: "Thanks to Contentlytics, I've cut my documentation time in half. Now I can focus on strategy — not paperwork.",
      author: "Lauren Mitchell",
      role: "Product Manager"
    }
  },
  { // 1: Create Project
    title: "Set up your first project.",
    description: "Projects help you organize your sessions and track progress over time.",
    testimonial: {
      quote: "Having everything in one project made it so much easier to track improvements across sprints.",
      author: "Alex Turner",
      role: "Growth Lead at Verve"
    }
  },
  { // 2: Start First Session
    title: "Run your first analysis.",
    description: "Enter a URL and we'll audit it instantly — brand presence, competitor signals, and AI visibility.",
    testimonial: {
      quote: "I had actionable insights within minutes of starting my first session. Game-changing.",
      author: "Emily White",
      role: "Data Analyst"
    }
  },
  { // 3: Connect Google Analytics
    title: "Supercharge your insights with real traffic data.",
    description: "Link Google Analytics to get audience behaviour, traffic trends, and AI-powered recommendations tailored to your brand.",
    testimonial: {
      quote: "Connecting Analytics turned our raw data into a story we could finally act on.",
      author: "Marcus Reid",
      role: "Head of Growth"
    }
  },
]

function LoadingScreen() {
  return (
    <div className="h-screen w-full bg-zinc-950 flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
  )
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading: isAuthLoading } = useAuth()
  const { toast } = useToast()

  const skipGuardRedirect = useRef(false)
  const gaCallbackHandled = useRef(false)

  const [updateUser] = useUpdateUserMutation()
  const [createProject, { isLoading: isCreatingProject }] = useCreateProjectMutation()
  const [createSession] = useCreateSessionMutation()
  const [createJob] = useCreateJobMutation()

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [brandRedirectParams, setBrandRedirectParams] = useState<BrandRedirectParams | null>(null)
  const [gaStatus, setGaStatus] = useState<'connected' | 'error' | undefined>(undefined)
  const [gaError, setGaError] = useState<string | undefined>(undefined)

  // Handle GA OAuth callback params returned by the backend redirect
  useEffect(() => {
    if (gaCallbackHandled.current) return
    const gaConnected = searchParams.get('ga_connected')
    const gaErrorParam = searchParams.get('ga_error')

    if (!gaConnected && !gaErrorParam) return
    gaCallbackHandled.current = true

    // Clean the URL so params don't persist on refresh
    const cleanUrl = window.location.pathname
    window.history.replaceState({}, '', cleanUrl)

    // Restore brand-onboarding params from sessionStorage
    const stored = sessionStorage.getItem(GA_REDIRECT_PARAMS_KEY)
    const params: BrandRedirectParams | null = stored ? JSON.parse(stored) : null

    if (gaConnected === '1') {
      setGaStatus('connected')
      setBrandRedirectParams(params)
      setCurrentStepIndex(3)
      skipGuardRedirect.current = true
      // Auto-proceed to brand-onboarding after a short success moment
      setTimeout(() => {
        sessionStorage.removeItem(GA_REDIRECT_PARAMS_KEY)
        if (params) {
          const qs = new URLSearchParams(params as unknown as Record<string, string>)
          router.push(`/brand-onboarding?${qs.toString()}`)
        } else {
          router.push('/dashboard')
        }
      }, 1500)
    } else if (gaErrorParam) {
      setGaStatus('error')
      setGaError(gaErrorParam)
      setBrandRedirectParams(params)
      setCurrentStepIndex(3)
      skipGuardRedirect.current = true
      toast({
        title: gaErrorParam === 'access_denied' ? 'Permission denied' : 'Connection failed',
        description:
          gaErrorParam === 'access_denied'
            ? 'You can skip this step and connect Google Analytics later from settings.'
            : 'Could not connect Google Analytics. Please try again.',
        variant: 'destructive',
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Guard: redirect away if user already completed onboarding
  useEffect(() => {
    if (isAuthLoading) return
    if (skipGuardRedirect.current) return
    if (user && user.hasNew === false) {
      router.replace('/dashboard')
    }
    if (!user) {
      window.location.replace('/signin')
    }
  }, [user, isAuthLoading, router])

  const handleNext = async () => {
    if (currentStepIndex === 0 && user) {
      skipGuardRedirect.current = true
      try {
        await updateUser({ id: user.id, data: { hasNew: false } }).unwrap()
      } catch {
        skipGuardRedirect.current = false
        toast({
          title: "Something went wrong",
          description: "Please try again.",
          variant: "destructive",
        })
        return
      }
    }
    if (currentStepIndex < TOTAL_STEPS - 1) {
      setCurrentStepIndex(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }

  const handleCreateProject = async (name: string, description?: string) => {
    try {
      const result = await createProject({ name, description }).unwrap()
      setCreatedProjectId(result.project.id)
      toast({ title: "Project created!", description: `"${name}" is ready.` })
      setCurrentStepIndex(2)
    } catch (error: any) {
      toast({
        title: "Failed to create project",
        description: error?.data?.error || "Please try again.",
        variant: "destructive",
      })
    }
  }

  // Step 2: create session + job, then proceed to GA step (step 3) instead of jumping straight to brand-onboarding
  const handleStartSession = async (url: string) => {
    if (!createdProjectId) {
      router.push('/dashboard')
      return
    }

    setIsStartingSession(true)
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`

    try {
      const sessionResult = await createSession(createdProjectId).unwrap()
      const sessionId = sessionResult.session.id

      const jobResult = await createJob({
        sessionId,
        data: { url: normalizedUrl, jobType: 'MODULE_E_QUICK_START' },
      }).unwrap()

      const params: BrandRedirectParams = {
        projectId: createdProjectId,
        url: normalizedUrl,
        sessionId,
        jobId: jobResult.job.id,
      }
      setBrandRedirectParams(params)
      setCurrentStepIndex(3)
    } catch (error: any) {
      toast({
        title: 'Failed to start session',
        description: error?.data?.error || 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsStartingSession(false)
    }
  }

  /** Redirect to Google OAuth for Analytics — persists brand params in sessionStorage first */
  const handleConnectGA = () => {
    if (brandRedirectParams) {
      sessionStorage.setItem(GA_REDIRECT_PARAMS_KEY, JSON.stringify(brandRedirectParams))
    }
    // Full-page redirect to backend OAuth initiation endpoint
    window.location.href = `${API_BASE_URL}/auth/google/analytics`
  }

  /** Skip GA — go straight to brand-onboarding */
  const handleSkipGA = () => {
    sessionStorage.removeItem(GA_REDIRECT_PARAMS_KEY)
    if (brandRedirectParams) {
      const qs = new URLSearchParams(brandRedirectParams as unknown as Record<string, string>)
      router.push(`/brand-onboarding?${qs.toString()}`)
    } else {
      router.push('/dashboard')
    }
  }

  const handleSkipToDashboard = () => {
    router.push('/dashboard')
  }

  if (isAuthLoading || !user || (user.hasNew === false && !skipGuardRedirect.current)) {
    return <LoadingScreen />
  }

  const renderStep = () => {
    switch (currentStepIndex) {
      case 0:
        return <StepWelcome onNext={handleNext} />
      case 1:
        return (
          <StepCreateProject
            onAdd={handleCreateProject}
            onSkip={handleSkipToDashboard}
            onBack={handleBack}
            isLoading={isCreatingProject}
            currentStep={currentStepIndex}
            totalSteps={TOTAL_STEPS}
          />
        )
      case 2:
        return (
          <StepStartSession
            onStart={handleStartSession}
            onSkip={handleSkipToDashboard}
            onBack={handleBack}
            isLoading={isStartingSession}
            currentStep={currentStepIndex}
            totalSteps={TOTAL_STEPS}
          />
        )
      case 3:
        return (
          <StepConnectAnalytics
            onConnect={handleConnectGA}
            onSkip={handleSkipGA}
            onBack={handleBack}
            gaStatus={gaStatus}
            gaError={gaError}
            currentStep={currentStepIndex}
            totalSteps={TOTAL_STEPS}
          />
        )
      default:
        return null
    }
  }

  return (
    <OnboardingLayout
      currentStep={currentStepIndex}
      totalSteps={TOTAL_STEPS}
      leftPanelContent={LEFT_PANEL_CONTENT[currentStepIndex]}
    >
      <AnimatePresence mode="wait">
        <div key={currentStepIndex} className="h-full">
          {renderStep()}
        </div>
      </AnimatePresence>
    </OnboardingLayout>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OnboardingContent />
    </Suspense>
  )
}
