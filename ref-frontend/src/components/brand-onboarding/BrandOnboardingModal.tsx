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
import type { GeneratedPrompt, TopicPrompts, PromptResult, BrandProfile } from '@/store/api/brandOnboardingApi'
import { useUpdateUserMutation } from '@/store/api/userApi'
import { useToast } from '@/hooks/use-toast'
import type { User } from '@/types/auth'

import { OnboardingLayout } from '@/components/onboarding/layout'
import { StepBrandReady } from '@/components/brand-onboarding/step-brand-ready'
import { StepBrandTopics } from '@/components/brand-onboarding/step-brand-topics'
import { StepBrandPrompts } from '@/components/brand-onboarding/step-brand-prompts'
import { StepBrandResults } from '@/components/brand-onboarding/step-brand-results'

const TOTAL_STEPS = 4

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
  const [prompts, setPrompts] = useState<TopicPrompts[]>([])
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>([])
  const [customPrompts, setCustomPrompts] = useState<string[]>([])
  const [promptResults, setPromptResults] = useState<PromptResult[]>([])
  const [isExecutingPrompts, setIsExecutingPrompts] = useState(false)
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null)

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
    setSelectedPrompts([])
    setCustomPrompts([])
    setPromptResults([])
    setBrandProfile(null)
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
          if (stored.profile) setBrandProfile(stored.profile)
          setIsDescriptionLoading(false)
          return
        }
      } catch {
        // Not found yet — fall through to generate
      }
      try {
        const result = await generateBrandDescription({ url: rawUrl, jobId }).unwrap()
        setBrandDescription(result.description)
        if (result.profile) setBrandProfile(result.profile)
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
            setPrompts(data.prompts_generated as TopicPrompts[])
          }
          if (data.prompts_selected?.length > 0 && selectedPrompts.length === 0) {
            setSelectedPrompts(data.prompts_selected)
            // Restore any custom prompts that aren't in the generated list
            const generatedPromptStrings = (data.prompts_generated as TopicPrompts[] | undefined)
              ?.flatMap(g => (g.prompts ?? []).map(p => p.prompt)) ?? []
            const custom = data.prompts_selected.filter((p: string) => !generatedPromptStrings.includes(p))
            if (custom.length > 0) setCustomPrompts(custom)
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
        setPrompts(result.topics)
      } catch {
        setPrompts([])
      }
    }

    setIsAdvancingToPrompts(false)
    goToStep(2)
  }

  const runPromptExecution = useCallback(async (promptsOverride?: GeneratedPrompt[]) => {
    let allPromptsForExecution: GeneratedPrompt[]
    if (promptsOverride) {
      allPromptsForExecution = promptsOverride
    } else {
      const flatGenerated = prompts.flatMap(g => g.prompts ?? [])
      const activePrompts = selectedPrompts.length > 0
        ? selectedPrompts
        : [...flatGenerated.map(p => p.prompt), ...customPrompts]
      allPromptsForExecution = [
        ...flatGenerated,
        ...customPrompts.map((p) => ({ prompt: p, type: 'custom' })),
      ].filter(p => activePrompts.includes(p.prompt))
    }

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
  }, [prompts, customPrompts, selectedPrompts, brandName, jobId, executeBrandPrompts, fetchOnboardingData, toast])

  const handlePromptsContinue = async () => {
    // Only execute the currently selected prompts
    const flatGenerated = prompts.flatMap(g => g.prompts ?? [])
    const activePrompts = selectedPrompts.length > 0
      ? selectedPrompts
      : [...flatGenerated.map(p => p.prompt), ...customPrompts]

    const allPromptsForExecution: GeneratedPrompt[] = [
      ...flatGenerated,
      ...customPrompts.map((p) => ({ prompt: p, type: 'custom' })),
    ].filter(p => activePrompts.includes(p.prompt))
    
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

    // Pass the already-computed list directly to avoid stale-closure re-derivation
    void runPromptExecution(allPromptsForExecution)
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
                topicGroups={prompts}
                onTopicGroupsChange={setPrompts}
                selectedPrompts={selectedPrompts}
                onSelectedPromptsChange={setSelectedPrompts}
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
