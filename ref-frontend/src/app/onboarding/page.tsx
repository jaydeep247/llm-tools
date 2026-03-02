
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateUserMutation } from '@/store/api/userApi'
import { useCreateProjectMutation } from '@/store/api/projectApi'
import { useCreateSessionMutation, useCreateJobMutation } from '@/store/api/sessionApi'
import { useToast } from '@/hooks/use-toast'
import { AnimatePresence } from 'framer-motion'

import { OnboardingLayout } from '@/components/onboarding/layout'
import { StepWelcome } from '@/components/onboarding/steps/step-welcome'
import { StepRole } from '@/components/onboarding/steps/step-role'
import { StepOrg } from '@/components/onboarding/steps/step-org'
import { StepFocus } from '@/components/onboarding/steps/step-focus'
import { StepCreateProject } from '@/components/onboarding/steps/step-create-project'
import { StepStartSession } from '@/components/onboarding/steps/step-start-session'

const TOTAL_STEPS = 6

// Configuration for the dynamic left panel content
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
  { // 1: Role
    title: "Tell us about your role.",
    description: "We customize the dashboard based on your responsibilities to show you what matters most.",
    testimonial: {
      quote: "The role-based views are a game changer for our cross-functional team alignment.",
      author: "David Chen",
      role: "CTO at TechFlow"
    }
  },
  { // 2: Org
    title: "How do you operate?",
    description: "Whether you're a solo founder or an enterprise team, we have tools that scale with your needs.",
    testimonial: {
      quote: "Scaling our operations with Contentlytics was seamless. It grew with us from day one.",
      author: "Sarah Jones",
      role: "Director of Operations"
    }
  },
  { // 3: Focus
    title: "What's your priority?",
    description: "Select your primary focus area. We'll highlight the relevant metrics and insights for you.",
    testimonial: {
      quote: "I love how it surfaces exactly what I need to see without digging through clutter.",
      author: "Mike Ross",
      role: "SEO Specialist"
    }
  },
  { // 4: Create Project
    title: "Set up your first project.",
    description: "Projects help you organize your sessions and track progress over time.",
    testimonial: {
      quote: "Having everything in one project made it so much easier to track improvements across sprints.",
      author: "Alex Turner",
      role: "Growth Lead at Verve"
    }
  },
  { // 5: Start First Session
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

  // Guard: redirect away when auth resolves
  useEffect(() => {
    if (isAuthLoading) return
    // Already completed onboarding → go to dashboard
    if (user && user.hasNew === false) {
      router.replace('/dashboard')
    }
    // Not authenticated → go to home (also handled by middleware, this is a fallback)
    if (!user) {
      router.replace('/')
    }
  }, [user, isAuthLoading, router])

  const [updateUser, { isLoading: isSavingProfile }] = useUpdateUserMutation()
  const [createProject, { isLoading: isCreatingProject }] = useCreateProjectMutation()
  const [createSession] = useCreateSessionMutation()
  const [createJob] = useCreateJobMutation()

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [formData, setFormData] = useState({
    role: '',
    organizationType: '',
    focusArea: '',
  })
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Save the user profile (called when leaving the Focus step)
  const saveProfile = async (): Promise<boolean> => {
    if (!user) return false
    try {
      await updateUser({
        id: user.id,
        data: { hasNew: false, onboardingData: formData },
      }).unwrap()
      return true
    } catch (error) {
      console.error('Failed to update profile:', error)
      toast({
        title: "Something went wrong",
        description: "Failed to save your preferences. Please try again.",
        variant: "destructive",
      })
      return false
    }
  }

  const handleNext = async () => {
    // Save profile when leaving the Focus step before entering action steps
    if (currentStepIndex === 3) {
      const saved = await saveProfile()
      if (!saved) return
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

  // Step 4: user creates a project → advance to session step
  const handleCreateProject = async (name: string, description?: string) => {
    try {
      const result = await createProject({ name, description }).unwrap()
      setCreatedProjectId(result.project.id)
      toast({ title: "Project created!", description: `"${name}" is ready.` })
      setCurrentStepIndex(5)
    } catch (error: any) {
      toast({
        title: "Failed to create project",
        description: error?.data?.error || "Please try again.",
        variant: "destructive",
      })
    }
  }

  // Step 5: user starts a session → navigate to progress page (which redirects to dashboard on completion)
  const handleStartSession = async (url: string) => {
    if (!createdProjectId) return
    setIsStartingSession(true)
    try {
      const sessionResult = await createSession(createdProjectId).unwrap()
      const sessionId = sessionResult.session.id
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
      const jobResult = await createJob({
        sessionId,
        data: { url: normalizedUrl, jobType: 'MODULE_E_QUICK_START' },
      }).unwrap()
      router.push(`/dashboard/jobs/${jobResult.job.id}/progress`)
    } catch (error: any) {
      toast({
        title: "Failed to start session",
        description: error?.data?.error || "Please try again.",
        variant: "destructive",
      })
      setIsStartingSession(false)
    }
  }

  // Skip any action step → go straight to dashboard
  const handleSkipToDashboard = () => {
    router.push('/dashboard')
  }

  // Show nothing (or a spinner) while auth is resolving / while redirecting
  if (isAuthLoading || !user || user.hasNew === false) {
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
          <StepRole
            onNext={handleNext}
            onBack={handleBack}
            value={formData.role}
            onChange={(val) => updateFormData('role', val)}
            currentStep={currentStepIndex}
            totalSteps={TOTAL_STEPS}
          />
        )
      case 2:
        return (
          <StepOrg
            onNext={handleNext}
            onBack={handleBack}
            value={formData.organizationType}
            onChange={(val) => updateFormData('organizationType', val)}
            currentStep={currentStepIndex}
            totalSteps={TOTAL_STEPS}
          />
        )
      case 3:
        return (
          <StepFocus
            onNext={handleNext}
            onBack={handleBack}
            value={formData.focusArea}
            onChange={(val) => updateFormData('focusArea', val)}
            currentStep={currentStepIndex}
            totalSteps={TOTAL_STEPS}
            isLoading={isSavingProfile}
          />
        )
      case 4:
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
      case 5:
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
