'use client'

import { Suspense } from 'react'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useGenerateBrandDescriptionMutation, useLazyGetBrandDescriptionQuery } from '@/store/api/brandOnboardingApi'
import { AnimatePresence } from 'framer-motion'

import { OnboardingLayout } from '@/components/onboarding/layout'
import { StepBrandReady } from '@/components/brand-onboarding/step-brand-ready'

const TOTAL_STEPS = 1

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
]

function LoadingSpinner() {
  return (
    <div className="h-screen w-full bg-white flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-500 animate-spin" />
    </div>
  )
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
  const { user, isLoading: isAuthLoading } = useAuth()

  const projectId = searchParams.get('projectId')
  const rawUrl = searchParams.get('url') ?? ''
  const jobId = searchParams.get('jobId') ?? ''

  const [generateBrandDescription] = useGenerateBrandDescriptionMutation()
  const [fetchStoredDescription] = useLazyGetBrandDescriptionQuery()
  const descriptionFetched = useRef(false)

  const [brandDescription, setBrandDescription] = useState('')
  const [isDescriptionLoading, setIsDescriptionLoading] = useState(true)

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
    }
  }, [user, isAuthLoading])

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
      } catch {
        // Silent — description will show as unavailable
      } finally {
        setIsDescriptionLoading(false)
      }
    }
    fetchDescription()
  }, [rawUrl, jobId])

  // Quick_start is already running — go to job progress page
  const handleGoToProgress = () => {
    if (jobId) {
      router.push(`/dashboard/jobs/${jobId}/progress`)
    } else {
      router.push('/dashboard')
    }
  }

  const handleSkip = () => {
    router.push('/dashboard')
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
      currentStep={0}
      totalSteps={TOTAL_STEPS}
      leftPanelContent={LEFT_PANEL_CONTENT[0]}
    >
      <AnimatePresence mode="wait">
        <div key="brand-ready" className="h-full">
          <StepBrandReady
            brandName={brandName}
            brandDescription={brandDescription}
            url={rawUrl}
            onStart={handleGoToProgress}
            onSkip={handleSkip}
            isLoading={false}
            isDescriptionLoading={isDescriptionLoading}
            currentStep={0}
            totalSteps={TOTAL_STEPS}
          />
        </div>
      </AnimatePresence>
    </OnboardingLayout>
  )
}
