'use client'

import { Suspense } from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import {
  useGenerateBrandDescriptionMutation,
  useLazyGetBrandDescriptionQuery,
  useGenerateBrandTopicsMutation,
  useSaveBrandTopicsMutation,
  useGenerateBrandPromptsMutation,
  useSaveBrandPromptsMutation,
  useExecuteBrandPromptsMutation,
  useLazyGetOnboardingDataQuery,
} from '@/store/api/brandOnboardingApi'
import type { GeneratedPrompt, TopicPrompts, PromptResult, BrandProfile, AggregateStats } from '@/store/api/brandOnboardingApi'
import { AnimatePresence } from 'framer-motion'
import { useUpdateUserMutation } from '@/store/api/userApi'
import { useToast } from '@/hooks/use-toast'

import { OnboardingLayout } from '@/components/onboarding/layout'
import { StepBrandReady } from '@/components/brand-onboarding/step-brand-ready'
import { StepBrandTopics } from '@/components/brand-onboarding/step-brand-topics'
import { StepBrandPrompts } from '@/components/brand-onboarding/step-brand-prompts'
import { StepBrandResults } from '@/components/brand-onboarding/step-brand-results'
import { hasCompletedOnboarding } from '@/lib/onboarding'

const TOTAL_STEPS = 4

function LoadingSpinner() {
  return (
    <div className="h-screen w-full bg-brand-surface flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-brand-orange-light border-t-brand-orange animate-spin" />
    </div>
  )
}

function buildBrandOnboardingPath(params: {
  projectId: string
  url: string
  sessionId: string
  jobId: string
}, stepIndex: number) {
  const search = new URLSearchParams({
    projectId: params.projectId,
    url: params.url,
    sessionId: params.sessionId,
    jobId: params.jobId,
    step: String(stepIndex + 1),
  })

  return `/brand-onboarding?${search.toString()}`
}

export default function BrandOnboardingPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <BrandOnboardingContent />
    </Suspense>
  )
}

function BrandOnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { user, isLoading: isAuthLoading } = useAuth()
  const { toast } = useToast()

  const projectId = searchParams.get('projectId')
  const rawUrl = searchParams.get('url') ?? ''
  const sessionId = searchParams.get('sessionId') ?? ''
  const jobId = searchParams.get('jobId') ?? ''

  // Read initial step from URL (1-indexed in URL, 0-indexed in state)
  const initialStep = (() => {
    const s = parseInt(searchParams.get('step') ?? '', 10)
    return s >= 1 && s <= TOTAL_STEPS ? s - 1 : 0
  })()

  const [generateBrandDescription] = useGenerateBrandDescriptionMutation()
  const [fetchStoredDescription] = useLazyGetBrandDescriptionQuery()
  const [generateBrandTopics] = useGenerateBrandTopicsMutation()
  const [saveBrandTopics] = useSaveBrandTopicsMutation()
  const [generateBrandPrompts] = useGenerateBrandPromptsMutation()
  const [saveBrandPrompts] = useSaveBrandPromptsMutation()
  const [executeBrandPrompts] = useExecuteBrandPromptsMutation()
  const [fetchOnboardingData] = useLazyGetOnboardingDataQuery()
  const [updateUser] = useUpdateUserMutation()
  const descriptionFetched = useRef(false)
  const onboardingDataFetched = useRef(false)

  const [currentStep, setCurrentStep] = useState(initialStep)
  const [brandDescription, setBrandDescription] = useState('')
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null)
  const [isDescriptionLoading, setIsDescriptionLoading] = useState(true)
  const [topics, setTopics] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [isTopicsLoading, setIsTopicsLoading] = useState(false)
  const [isAdvancingToTopics, setIsAdvancingToTopics] = useState(false)
  const [isSavingTopics, setIsSavingTopics] = useState(false)
  const [prompts, setPrompts] = useState<TopicPrompts[]>([])
  const [customPrompts, setCustomPrompts] = useState<string[]>([])
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>([])
  const [hasInitializedSelectedPrompts, setHasInitializedSelectedPrompts] = useState(false)
  const [isAdvancingToPrompts, setIsAdvancingToPrompts] = useState(false)
  const [isSavingPrompts, setIsSavingPrompts] = useState(false)
  const [promptResults, setPromptResults] = useState<PromptResult[]>([])
  const [aggregate, setAggregate] = useState<AggregateStats | undefined>(undefined)
  const [isExecutingPrompts, setIsExecutingPrompts] = useState(false)

  const persistBrandProgress = async (step: number) => {
    if (!user || !projectId || !rawUrl || !sessionId || !jobId) return

    try {
      await updateUser({
        id: user.id,
        data: {
          onboardingState: {
            status: 'in_progress',
            currentFlow: 'brand',
            currentStep: step,
            resumePath: buildBrandOnboardingPath({ projectId, url: rawUrl, sessionId, jobId }, step),
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

  // Update URL ?step= when currentStep changes (1-indexed in URL)
  const goToStep = useCallback((step: number) => {
    setCurrentStep(step)
    const params = new URLSearchParams(searchParams.toString())
    params.set('step', String(step + 1))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    void persistBrandProgress(step)
  }, [pathname, persistBrandProgress, router, searchParams])

  // Infer brand name from URL domain (same logic as Python backend)
  const brandName = (() => {
    try {
      const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
      const hostname = new URL(url).hostname.replace('www.', '')
      const name = hostname.split('.')[0]
      return name.charAt(0).toUpperCase() + name.slice(1)
    } catch {
      return 'Unknown'
    }
  })()

  // Auth guard
  useEffect(() => {
    if (isAuthLoading) return
    if (!user) {
      window.location.replace('/signin')
      return
    }
    if (hasCompletedOnboarding(user)) {
      router.replace('/dashboard')
    }
  }, [user, isAuthLoading, router])

  // Fetch brand description: first try stored (from quick_start precompute),
  // then fall back to generating via POST
  useEffect(() => {
    if (!rawUrl || !jobId || descriptionFetched.current) return
    descriptionFetched.current = true

    const fetchDescription = async () => {
      setIsDescriptionLoading(true)
      try {
        // Try to get the precomputed description from DB
        const stored = await fetchStoredDescription(jobId).unwrap()
        if (stored?.description) {
          setBrandDescription(stored.description)
          if (stored.profile) setBrandProfile(stored.profile)
          setIsDescriptionLoading(false)
          return
        }
      } catch {
        // Not found yet — the quick_start worker may still be generating it
      }

      try {
        // Fall back: generate now (reads HTML from S3 + stores in DB)
        const result = await generateBrandDescription({ url: rawUrl, jobId }).unwrap()
        setBrandDescription(result.description)
        if (result.profile) setBrandProfile(result.profile)
      } catch {
        // Silent — description will show as unavailable
      } finally {
        setIsDescriptionLoading(false)
      }
    }
    fetchDescription()
  }, [rawUrl, jobId])

  // Hydrate stored onboarding data (topics, prompts) on mount when landing on step > 1
  useEffect(() => {
    if (!jobId || onboardingDataFetched.current) return
    onboardingDataFetched.current = true

    const hydrate = async () => {
      try {
        const data = await fetchOnboardingData(jobId).unwrap()
        if (data) {
          if (data.description && !brandDescription) {
            setBrandDescription(data.description)
            setIsDescriptionLoading(false)
          }          if (data.topics_generated?.length > 0 && topics.length === 0) {
            setTopics(data.topics_generated)
          }
          if (data.topics_selected?.length > 0 && selectedTopics.length === 0) {
            setSelectedTopics(data.topics_selected)
          }
          if (data.prompts_generated?.length > 0 && prompts.length === 0) {
            setPrompts(data.prompts_generated as TopicPrompts[])
          }
          if (data.prompts_selected?.length > 0 && selectedPrompts.length === 0) {
            setSelectedPrompts(data.prompts_selected)
            setHasInitializedSelectedPrompts(true)
          }
          if (data.prompt_results?.length > 0 && promptResults.length === 0) {
            setPromptResults(data.prompt_results)
            if (data.aggregate) setAggregate(data.aggregate)
          }
        }
      } catch {
        // No stored data — will generate on demand
      }
    }
    hydrate()
  }, [jobId])

  // Generate topics and then move to step 2
  const handleGoToTopics = async () => {
    // If topics already loaded, just advance
    if (topics.length > 0) {
      goToStep(1)
      return
    }

    setIsAdvancingToTopics(true)
    try {
      const result = await generateBrandTopics({
        url: rawUrl,
        brandName,
        brandDescription,
        jobId: jobId || undefined,
      }).unwrap()
      setTopics(result.topics)
    } catch {
      // If topic generation fails, set empty — user can still add custom
      setTopics([])
    } finally {
      setIsAdvancingToTopics(false)
      goToStep(1)
    }
  }

  // Save selected topics, generate prompts (if not already loaded), then advance to step 3
  const handleTopicsContinue = async () => {
    setIsAdvancingToPrompts(true)
    try {
      if (jobId && selectedTopics.length > 0) {
        await saveBrandTopics({ jobId, selectedTopics }).unwrap()
      }
    } catch {
      // Non-blocking — proceed even if save fails
    }

    // Only generate if we don't already have prompts
    if (prompts.length === 0) {
      try {
        const result = await generateBrandPrompts({
          brandName,
          brandDescription,
          selectedTopics,
          jobId: jobId || undefined,
        }).unwrap()
        setPrompts(result.topics)
        if (!hasInitializedSelectedPrompts) {
          setSelectedPrompts(result.topics.flatMap(t => (t.prompts ?? []).map(p => p.prompt)))
          setHasInitializedSelectedPrompts(true)
        }
      } catch {
        setPrompts([])
      }
    }

    setIsAdvancingToPrompts(false)
    goToStep(2)
  }

  // Save all selected prompts and advance to step 4 (results)
  const handlePromptsContinue = async () => {
    // We only want to execute and save the selected ones
    const allPrompts = selectedPrompts
    setIsSavingPrompts(true)
    try {
      if (jobId && allPrompts.length > 0) {
        await saveBrandPrompts({ jobId, selectedPrompts: allPrompts }).unwrap()
      }
    } catch {
      // Non-blocking
    } finally {
      setIsSavingPrompts(false)
    }

    goToStep(3)

    // If we already have results (from hydration), don't re-execute
    if (promptResults.length > 0) return

    // Execute prompts against all 3 LLMs
    setIsExecutingPrompts(true)
    try {
      // Combine generated prompts + custom prompts into the execution list, filtering by selection
      const executionList: GeneratedPrompt[] = []
      for (const group of prompts) {
        for (const p of group.prompts) {
          if (selectedPrompts.includes(p.prompt)) executionList.push(p)
        }
      }
      for (const p of customPrompts) {
        if (selectedPrompts.includes(p)) executionList.push({ prompt: p, type: 'custom' })
      }

      const result = await executeBrandPrompts({
        brandName,
        prompts: executionList,
        jobId: jobId || undefined,
      }).unwrap()
      setPromptResults(result.results)
      if (result.aggregate) setAggregate(result.aggregate)
    } catch {
      // Results will show as empty
    } finally {
      setIsExecutingPrompts(false)
    }
  }

  const handleSkip = () => {
    void persistBrandProgress(currentStep)
    // If we have all the identifiers, navigate to the session directly.
    // Otherwise fall back to the progress page (jobId still gets us close),
    // and finally fall back to the dashboard.
    if (projectId && sessionId) {
      router.push(`/dashboard/projects/${projectId}/sessions/${sessionId}`)
    } else if (jobId) {
      const params = new URLSearchParams()
      if (projectId) params.set('projectId', projectId)
      if (sessionId) params.set('sessionId', sessionId)
      const query = params.toString()
      router.push(`/dashboard/jobs/${jobId}/progress${query ? `?${query}` : ''}`)
    } else {
      router.push('/dashboard')
    }
  }

  if (isAuthLoading || !user) {
    return (
      <div className="h-screen w-full bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  return (
    <OnboardingLayout
      currentStep={currentStep}
      totalSteps={TOTAL_STEPS}
      size="wide"
    >
      <AnimatePresence mode="wait">
        {currentStep === 0 && (
          <div key="brand-ready" className="h-full">
            <StepBrandReady
              brandName={brandName}
              brandDescription={brandDescription}
              brandProfile={brandProfile}
              url={rawUrl}
              onStart={handleGoToTopics}
              onSkip={handleSkip}
              isLoading={isAdvancingToTopics}
              isDescriptionLoading={isDescriptionLoading}
              currentStep={0}
              totalSteps={TOTAL_STEPS}
            />
          </div>
        )}
        {currentStep === 1 && (
          <div key="brand-topics" className="h-full">
            <StepBrandTopics
              topics={topics}
              onTopicsChange={setTopics}
              selectedTopics={selectedTopics}
              onSelectedTopicsChange={setSelectedTopics}
              isTopicsLoading={isTopicsLoading}
              isSaving={isAdvancingToPrompts}
              onNext={handleTopicsContinue}
              onBack={() => goToStep(0)}
              onSkip={handleSkip}
              currentStep={1}
              totalSteps={TOTAL_STEPS}
            />
          </div>
        )}
        {currentStep === 2 && (
          <div key="brand-prompts" className="h-full">
            <StepBrandPrompts
              topicGroups={prompts}
              onTopicGroupsChange={setPrompts}
              customPrompts={customPrompts}
              onCustomPromptsChange={setCustomPrompts}
              selectedPrompts={selectedPrompts}
              onSelectedPromptsChange={setSelectedPrompts}
              isPromptsLoading={false}
              isSaving={isSavingPrompts}
              onNext={handlePromptsContinue}
              onBack={() => goToStep(1)}
              onSkip={handleSkip}
              currentStep={2}
              totalSteps={TOTAL_STEPS}
            />
          </div>
        )}
        {currentStep === 3 && (
          <div key="brand-results" className="h-full">
            <StepBrandResults
              results={promptResults}
              aggregate={aggregate}
              isLoading={isExecutingPrompts}
              brandName={brandName}
              onDashboard={async () => {
                try {
                  await updateUser({
                    id: user.id,
                    data: {
                      hasNew: false,
                      onboardingState: {
                        status: 'completed',
                        currentFlow: 'brand',
                        currentStep: 3,
                        resumePath: '/dashboard',
                      },
                    },
                  }).unwrap()

                  if (jobId) {
                    // Include projectId + sessionId so the progress page can redirect
                    // to the session even when the snapshot doesn't carry those fields.
                    const params = new URLSearchParams()
                    if (projectId) params.set('projectId', projectId)
                    if (sessionId) params.set('sessionId', sessionId)
                    const query = params.toString()
                    router.push(`/dashboard/jobs/${jobId}/progress${query ? `?${query}` : ''}`)
                  } else {
                    router.push('/dashboard')
                  }
                } catch {
                  toast({
                    title: 'Could not finish onboarding',
                    description: 'Please try again before leaving this page.',
                    variant: 'destructive',
                  })
                }
              }}
            />
          </div>
        )}
      </AnimatePresence>
    </OnboardingLayout>
  )
}
