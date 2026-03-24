
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
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

const TOTAL_STEPS = 3

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
]

export default function OnboardingPage() {
  const router = useRouter()
  const { user, isLoading: isAuthLoading } = useAuth()
  const { toast } = useToast()

  const skipGuardRedirect = useRef(false)

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

  const [updateUser] = useUpdateUserMutation()
  const [createProject, { isLoading: isCreatingProject }] = useCreateProjectMutation()
  const [createSession] = useCreateSessionMutation()
  const [createJob] = useCreateJobMutation()

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [isStartingSession, setIsStartingSession] = useState(false)

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

  // Step 2: user entered URL — create session + start quick_start job, then redirect to brand-onboarding
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

      // Redirect to brand-onboarding with all context — quick_start is now running in background
      const params = new URLSearchParams({
        projectId: createdProjectId,
        url: normalizedUrl,
        sessionId,
        jobId: jobResult.job.id,
      })
      router.push(`/brand-onboarding?${params.toString()}`)
    } catch (error: any) {
      toast({
        title: 'Failed to start session',
        description: error?.data?.error || 'Please try again.',
        variant: 'destructive',
      })
      setIsStartingSession(false)
    }
  }

  const handleSkipToDashboard = () => {
    router.push('/dashboard')
  }

  if (isAuthLoading || !user || (user.hasNew === false && !skipGuardRedirect.current)) {
    return (
      <div className="h-screen w-full bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
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
