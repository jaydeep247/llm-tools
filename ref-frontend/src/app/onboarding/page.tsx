
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
import { StepCreateProject } from '@/components/onboarding/steps/step-create-project'
import { StepStartSession } from '@/components/onboarding/steps/step-start-session'
import { StepConnectAnalytics } from '@/components/onboarding/steps/step-connect-analytics'
import { hasCompletedOnboarding } from '@/lib/onboarding'

const TOTAL_STEPS = 3

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

/** Key used to persist brand-onboarding redirect params across the GA OAuth round-trip */
const GA_REDIRECT_PARAMS_KEY = 'onboarding_brand_params'

interface BrandRedirectParams {
  projectId: string
  url: string
  sessionId: string
  jobId: string
}

function buildCoreOnboardingPath(stepIndex: number, projectId?: string | null, brandParams?: BrandRedirectParams | null) {
  const params = new URLSearchParams()
  params.set('step', String(stepIndex + 1))

  const resolvedProjectId = brandParams?.projectId ?? projectId
  if (stepIndex >= 1 && resolvedProjectId) {
    params.set('projectId', resolvedProjectId)
  }

  if (stepIndex >= 2 && brandParams) {
    params.set('projectId', brandParams.projectId)
    params.set('sessionId', brandParams.sessionId)
    params.set('jobId', brandParams.jobId)
    params.set('url', brandParams.url)
  }

  return `/onboarding?${params.toString()}`
}

function buildBrandOnboardingPath(params: BrandRedirectParams, stepIndex = 0) {
  const search = new URLSearchParams({
    projectId: params.projectId,
    url: params.url,
    sessionId: params.sessionId,
    jobId: params.jobId,
    step: String(stepIndex + 1),
  })

  return `/brand-onboarding?${search.toString()}`
}



function LoadingScreen() {
  return (
    <div className="h-screen w-full bg-brand-surface flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-brand-orange-light border-t-brand-orange animate-spin" />
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

  const projectIdParam = searchParams.get('projectId')
  const sessionIdParam = searchParams.get('sessionId')
  const jobIdParam = searchParams.get('jobId')
  const urlParam = searchParams.get('url')

  const initialBrandRedirectParams: BrandRedirectParams | null =
    projectIdParam && sessionIdParam && jobIdParam && urlParam
      ? {
          projectId: projectIdParam,
          sessionId: sessionIdParam,
          jobId: jobIdParam,
          url: urlParam,
        }
      : null

  const initialStepIndex = (() => {
    const rawStep = parseInt(searchParams.get('step') ?? '', 10)
    let stepIndex = rawStep >= 1 && rawStep <= TOTAL_STEPS ? rawStep - 1 : 0

    if (stepIndex >= 2 && !initialBrandRedirectParams) {
      stepIndex = projectIdParam ? 1 : 0
    } else if (stepIndex >= 1 && !projectIdParam) {
      stepIndex = 0
    }

    return stepIndex
  })()

  const [currentStepIndex, setCurrentStepIndex] = useState(initialStepIndex)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(projectIdParam)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [brandRedirectParams, setBrandRedirectParams] = useState<BrandRedirectParams | null>(initialBrandRedirectParams)
  const [gaStatus, setGaStatus] = useState<'connected' | 'error' | undefined>(undefined)
  const [gaError, setGaError] = useState<string | undefined>(undefined)

  const persistCoreProgress = async (stepIndex: number, projectId = createdProjectId, params = brandRedirectParams) => {
    if (!user) return

    try {
      await updateUser({
        id: user.id,
        data: {
          onboardingState: {
            status: 'in_progress',
            currentFlow: 'core',
            currentStep: stepIndex,
            resumePath: buildCoreOnboardingPath(stepIndex, projectId, params),
          },
        },
      }).unwrap()
    } catch {
      toast({
        title: 'Could not save onboarding progress',
        description: 'Your current step may not be restored automatically next time.',
        variant: 'destructive',
      })
    }
  }

  const persistBrandEntry = async (params: BrandRedirectParams, stepIndex = 0) => {
    if (!user) return

    try {
      await updateUser({
        id: user.id,
        data: {
          onboardingState: {
            status: 'in_progress',
            currentFlow: 'brand',
            currentStep: stepIndex,
            resumePath: buildBrandOnboardingPath(params, stepIndex),
          },
        },
      }).unwrap()
    } catch {
      toast({
        title: 'Could not save onboarding progress',
        description: 'Your current step may not be restored automatically next time.',
        variant: 'destructive',
      })
    }
  }

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
      setCurrentStepIndex(2)
      skipGuardRedirect.current = true
      if (params) {
        void persistBrandEntry(params, 0)
      }
      // Auto-proceed to brand-onboarding after a short success moment
      setTimeout(() => {
        sessionStorage.removeItem(GA_REDIRECT_PARAMS_KEY)
        if (params) {
          router.replace(buildBrandOnboardingPath(params, 0))
        } else {
          router.replace('/dashboard')
        }
      }, 1500)
    } else if (gaErrorParam) {
      setGaStatus('error')
      setGaError(gaErrorParam)
      setBrandRedirectParams(params)
      setCurrentStepIndex(2)
      skipGuardRedirect.current = true
      void persistCoreProgress(2, params?.projectId ?? projectIdParam, params)
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
    if (user && hasCompletedOnboarding(user)) {
      router.replace('/dashboard')
    }
    if (!user) {
      window.location.replace('/signin')
    }
  }, [user, isAuthLoading, router])

  const handleNext = async () => {
    if (currentStepIndex < TOTAL_STEPS - 1) {
      const nextStepIndex = currentStepIndex + 1
      setCurrentStepIndex(nextStepIndex)
      void persistCoreProgress(nextStepIndex)
    }
  }

  const handleBack = () => {
    if (currentStepIndex > 0) {
      const previousStepIndex = currentStepIndex - 1
      setCurrentStepIndex(previousStepIndex)
      void persistCoreProgress(previousStepIndex)
    }
  }

  const handleCreateProject = async (name: string, description?: string) => {
    try {
      const result = await createProject({ name, description }).unwrap()
      setCreatedProjectId(result.project.id)
      toast({ title: "Project created!", description: `"${name}" is ready.` })
      setCurrentStepIndex(1)
      void persistCoreProgress(1, result.project.id, null)
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
      router.replace('/dashboard')
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
      setCurrentStepIndex(2)
      void persistCoreProgress(2, createdProjectId, params)
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
      void persistCoreProgress(3, brandRedirectParams.projectId, brandRedirectParams)
    }
    // Full-page redirect to backend OAuth initiation endpoint
    window.location.href = `${API_BASE_URL}/auth/google/analytics`
  }

  /** Skip GA — go straight to brand-onboarding if we have params, otherwise exit to dashboard */
  const handleSkipGA = async () => {
    sessionStorage.removeItem(GA_REDIRECT_PARAMS_KEY)
    skipGuardRedirect.current = true
    if (brandRedirectParams) {
      const destination = buildBrandOnboardingPath(brandRedirectParams, 0)
      void persistBrandEntry(brandRedirectParams, 0)
      router.replace(destination)
    } else {
      // No session was started — mark onboarding completed so the dashboard guard lets through
      try {
        await updateUser({
          id: user!.id,
          data: {
            onboardingState: {
              status: 'completed',
              currentFlow: 'core',
              currentStep: currentStepIndex,
              resumePath: '/dashboard',
            },
          },
        }).unwrap()
      } catch {
        // Non-blocking
      }
      router.replace('/dashboard')
    }
  }

  const handleSkipStep = () => {
    const nextStep = currentStepIndex + 1
    setCurrentStepIndex(nextStep)
    void persistCoreProgress(nextStep)
  }

  const handleSkipToDashboard = async () => {
    skipGuardRedirect.current = true
    try {
      await updateUser({
        id: user!.id,
        data: {
          onboardingState: {
            status: 'completed',
            currentFlow: 'core',
            currentStep: currentStepIndex,
            resumePath: '/dashboard',
          },
        },
      }).unwrap()
    } catch {
      // Non-blocking — proceed to dashboard regardless
    }
    router.replace('/dashboard')
  }

  if (isAuthLoading || !user || (hasCompletedOnboarding(user) && !skipGuardRedirect.current)) {
    return <LoadingScreen />
  }

  const renderStep = () => {
    switch (currentStepIndex) {
      case 0:
        return (
          <StepCreateProject
            onAdd={handleCreateProject}
            onSkip={handleSkipStep}
            isLoading={isCreatingProject}
            currentStep={currentStepIndex}
            totalSteps={TOTAL_STEPS}
          />
        )
      case 1:
        return (
          <StepStartSession
            onStart={handleStartSession}
            onSkip={handleSkipStep}
            onBack={handleBack}
            isLoading={isStartingSession}
            currentStep={currentStepIndex}
            totalSteps={TOTAL_STEPS}
          />
        )
      case 2:
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
