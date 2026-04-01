'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
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
import type { GeneratedPrompt, PromptResult } from '@/store/api/brandOnboardingApi'
import { useUpdateUserMutation } from '@/store/api/userApi'
import { useToast } from '@/hooks/use-toast'
import type { User } from '@/types/auth'

import { OnboardingLayout } from '@/components/onboarding/layout'
import { StepBrandReady } from '@/components/brand-onboarding/step-brand-ready'
import { StepBrandTopics } from '@/components/brand-onboarding/step-brand-topics'
import { StepBrandPrompts } from '@/components/brand-onboarding/step-brand-prompts'
import { StepBrandResults } from '@/components/brand-onboarding/step-brand-results'

const TOTAL_STEPS = 4

const LEFT_PANEL_CONTENT = [
  {
    title: 'Ready to run your first analysis.',
    description: 'We\'ve generated an AI description from your website. Your quick-start analysis is already running in the background.',
    testimonial: {
      quote: 'I had actionable insights within minutes of starting my first session. Genuinely game-changing.',
      author: 'Emily White',
      role: 'Data Analyst',
    },
  },
  {
    title: 'What topics matter to your brand?',
    description: 'We\'ll track how your brand appears in AI-generated responses for the topics you choose.',
    testimonial: {
      quote: 'Picking the right topics to monitor gave us clarity on where our brand was winning — and where we were invisible.',
      author: 'James Carter',
      role: 'Brand Strategist',
    },
  },
  {
    title: 'Review your AI prompts.',
    description: 'We\'ve generated prompts based on your topics. These are the exact queries we\'ll use to monitor your brand in AI responses.',
    testimonial: {
      quote: 'Seeing the actual prompts gave us confidence that we were tracking exactly what mattered to our business.',
      author: 'Sarah Mitchell',
      role: 'Marketing Director',
    },
  },
  {
    title: 'Your brand visibility snapshot.',
    description: 'We sent your prompts to GPT, Gemini, and Claude. Here\'s how your brand appears across AI-generated responses.',
    testimonial: {
      quote: 'Seeing our brand visibility scored across all major AI platforms was a real eye-opener for our strategy.',
      author: 'David Chen',
      role: 'Growth Lead',
    },
  },
]

interface BrandOnboardingModalProps {
  open: boolean
  projectId: string
  url: string
  sessionId: string
  jobId: string
  user: Pick<User, 'id' | 'hasNew' | 'onboardingState'>
  onComplete: () => void
  onSkip: () => void
}

export function BrandOnboardingModal({
  open,
  projectId,
  url: rawUrl,
  sessionId,
  jobId,
  user,
  onComplete,
  onSkip,
}: BrandOnboardingModalProps) {
  const { toast } = useToast()

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

  const [currentStep, setCurrentStep] = useState(0)
  const [brandDescription, setBrandDescription] = useState('')
  const [isDescriptionLoading, setIsDescriptionLoading] = useState(true)
  const [topics, setTopics] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [isAdvancingToTopics, setIsAdvancingToTopics] = useState(false)
  const [isAdvancingToPrompts, setIsAdvancingToPrompts] = useState(false)
  const [isSavingPrompts, setIsSavingPrompts] = useState(false)
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([])
  const [customPrompts, setCustomPrompts] = useState<string[]>([])
  const [promptResults, setPromptResults] = useState<PromptResult[]>([])
  const [isExecutingPrompts, setIsExecutingPrompts] = useState(false)

  // Reset state when modal opens with new params
  useEffect(() => {
    if (!open) return
    descriptionFetched.current = false
    onboardingDataFetched.current = false
    setCurrentStep(0)
    setBrandDescription('')
    setIsDescriptionLoading(true)
    setTopics([])
    setSelectedTopics([])
    setPrompts([])
    setCustomPrompts([])
    setPromptResults([])
  }, [open, jobId])

  // Infer brand name from URL domain
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

  const persistBrandProgress = useCallback(async (step: number) => {
    if (!user || !projectId || !rawUrl || !sessionId || !jobId) return
    const search = new URLSearchParams({
      projectId,
      url: rawUrl,
      sessionId,
      jobId,
      step: String(step + 1),
    })
    try {
      await updateUser({
        id: user.id,
        data: {
          onboardingState: {
            status: 'in_progress',
            currentFlow: 'brand',
            currentStep: step,
            resumePath: `/brand-onboarding?${search.toString()}`,
          },
        },
      }).unwrap()
    } catch {
      // non-blocking
    }
  }, [user, projectId, rawUrl, sessionId, jobId, updateUser])

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step)
    void persistBrandProgress(step)
  }, [persistBrandProgress])

  // Fetch brand description when modal opens
  useEffect(() => {
    if (!open || !rawUrl || !jobId || descriptionFetched.current) return
    descriptionFetched.current = true

    const fetchDescription = async () => {
      setIsDescriptionLoading(true)
      try {
        const stored = await fetchStoredDescription(jobId).unwrap()
        if (stored?.description) {
          setBrandDescription(stored.description)
          setIsDescriptionLoading(false)
          return
        }
      } catch {
        // Not found yet — fall through to generate
      }
      try {
        const result = await generateBrandDescription({ url: rawUrl, jobId }).unwrap()
        setBrandDescription(result.description)
      } catch {
        // silent
      } finally {
        setIsDescriptionLoading(false)
      }
    }
    void fetchDescription()
  }, [open, rawUrl, jobId])

  // Hydrate stored onboarding data on mount
  useEffect(() => {
    if (!open || !jobId || onboardingDataFetched.current) return
    onboardingDataFetched.current = true

    const hydrate = async () => {
      try {
        const data = await fetchOnboardingData(jobId).unwrap()
        if (data) {
          if (data.description && !brandDescription) {
            setBrandDescription(data.description)
            setIsDescriptionLoading(false)
          }
          if (data.topics_generated?.length > 0 && topics.length === 0) {
            setTopics(data.topics_generated)
          }
          if (data.topics_selected?.length > 0 && selectedTopics.length === 0) {
            setSelectedTopics(data.topics_selected)
          }
          if (data.prompts_generated?.length > 0 && prompts.length === 0) {
            setPrompts(data.prompts_generated)
          }
          if (data.prompt_results?.length > 0 && promptResults.length === 0) {
            setPromptResults(data.prompt_results)
          }
        }
      } catch {
        // No stored data
      }
    }
    void hydrate()
  }, [open, jobId])

  const handleGoToTopics = async () => {
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
      setTopics([])
    } finally {
      setIsAdvancingToTopics(false)
      goToStep(1)
    }
  }

  const handleTopicsContinue = async () => {
    setIsAdvancingToPrompts(true)
    try {
      if (jobId && selectedTopics.length > 0) {
        await saveBrandTopics({ jobId, selectedTopics }).unwrap()
      }
    } catch {
      // non-blocking
    }

    if (prompts.length === 0) {
      try {
        const result = await generateBrandPrompts({
          brandName,
          brandDescription,
          selectedTopics,
          jobId: jobId || undefined,
        }).unwrap()
        setPrompts(result.prompts)
      } catch {
        setPrompts([])
      }
    }

    setIsAdvancingToPrompts(false)
    goToStep(2)
  }

  const runPromptExecution = useCallback(async () => {
    const allPromptsForExecution: GeneratedPrompt[] = [
      ...prompts,
      ...customPrompts.map((p) => ({ prompt: p, type: 'custom' })),
    ]
    if (allPromptsForExecution.length === 0) {
      toast({
        title: 'No prompts to analyze',
        description: 'Please go back and select or add at least one prompt.',
        variant: 'destructive',
      })
      return
    }
    setIsExecutingPrompts(true)
    try {
      const result = await executeBrandPrompts({
        brandName,
        prompts: allPromptsForExecution,
        jobId: jobId || undefined,
      }).unwrap()
      setPromptResults(result.results)
    } catch (err: any) {
      toast({
        title: 'Brand analysis failed',
        description: err?.data?.message || 'Could not run brand visibility analysis. Tap Retry to try again.',
        variant: 'destructive',
      })
      // Fallback: try to pull any previously stored results from DB
      if (jobId) {
        try {
          const data = await fetchOnboardingData(jobId).unwrap()
          if (data?.prompt_results && data.prompt_results.length > 0) {
            setPromptResults(data.prompt_results)
          }
        } catch {
          // No stored results
        }
      }
    } finally {
      setIsExecutingPrompts(false)
    }
  }, [prompts, customPrompts, brandName, jobId, executeBrandPrompts, fetchOnboardingData, toast])

  const handlePromptsContinue = async () => {
    const allPromptsForExecution: GeneratedPrompt[] = [
      ...prompts,
      ...customPrompts.map((p) => ({ prompt: p, type: 'custom' })),
    ]
    if (allPromptsForExecution.length === 0) {
      toast({
        title: 'No prompts to analyze',
        description: 'Please select or add at least one prompt before continuing.',
        variant: 'destructive',
      })
      return
    }
    const allPromptStrings = allPromptsForExecution.map((p) => p.prompt)
    setIsSavingPrompts(true)
    try {
      if (jobId) {
        await saveBrandPrompts({ jobId, selectedPrompts: allPromptStrings }).unwrap()
      }
    } catch {
      // non-blocking
    } finally {
      setIsSavingPrompts(false)
    }

    goToStep(3)

    if (promptResults.length > 0) return

    void runPromptExecution()
  }

  const handleSkip = () => {
    void persistBrandProgress(currentStep)
    onSkip()
  }

  const handleDashboard = async () => {
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
      onComplete()
    } catch {
      toast({
        title: 'Could not finish onboarding',
        description: 'Please try again before leaving this page.',
        variant: 'destructive',
      })
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-white">
      <OnboardingLayout
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        leftPanelContent={LEFT_PANEL_CONTENT[currentStep]}
      >
        <AnimatePresence mode="wait">
          {currentStep === 0 && (
            <div key="brand-ready" className="h-full">
              <StepBrandReady
                brandName={brandName}
                brandDescription={brandDescription}
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
                selectedTopics={selectedTopics}
                onSelectedTopicsChange={setSelectedTopics}
                isTopicsLoading={false}
                isSaving={isAdvancingToPrompts}
                onNext={handleTopicsContinue}
                onBack={() => goToStep(0)}
                currentStep={1}
                totalSteps={TOTAL_STEPS}
              />
            </div>
          )}
          {currentStep === 2 && (
            <div key="brand-prompts" className="h-full">
              <StepBrandPrompts
                prompts={prompts}
                customPrompts={customPrompts}
                onCustomPromptsChange={setCustomPrompts}
                isPromptsLoading={false}
                isSaving={isSavingPrompts}
                onNext={handlePromptsContinue}
                onBack={() => goToStep(1)}
                currentStep={2}
                totalSteps={TOTAL_STEPS}
              />
            </div>
          )}
          {currentStep === 3 && (
            <div key="brand-results" className="h-full">
              <StepBrandResults
                results={promptResults}
                isLoading={isExecutingPrompts}
                brandName={brandName}
                onDashboard={handleDashboard}
                onRetry={runPromptExecution}
              />
            </div>
          )}
        </AnimatePresence>
      </OnboardingLayout>
    </div>
  )
}
