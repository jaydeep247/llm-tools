
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateUserMutation } from '@/store/api/userApi'
import { useToast } from '@/hooks/use-toast'
import { AnimatePresence } from 'framer-motion'

import { OnboardingLayout } from '@/components/onboarding/layout'
import { StepWelcome } from '@/components/onboarding/steps/step-welcome'
import { StepRole } from '@/components/onboarding/steps/step-role'
import { StepOrg } from '@/components/onboarding/steps/step-org'
import { StepFocus } from '@/components/onboarding/steps/step-focus'
import { StepFinal } from '@/components/onboarding/steps/step-final'

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
  { // 4: Final
    title: "Ready to launch.",
    description: "Your workspace is ready. Let's create your first project and start analyzing your data.",
    testimonial: {
      quote: "Setup was incredibly fast. I was analyzing critical data within minutes of signing up.",
      author: "Emily White",
      role: "Data Analyst"
    }
  }
]

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const [updateUser, { isLoading }] = useUpdateUserMutation()
  
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [formData, setFormData] = useState({
    role: '',
    organizationType: '',
    focusArea: '',
  })

  const handleNext = () => {
    if (currentStepIndex < 4) {
      setCurrentStepIndex(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleComplete = async () => {
    if (!user) return

    try {
      await updateUser({
        id: user.id,
        data: {
          hasNew: false,
          onboardingData: formData
        }
      }).unwrap()

      toast({
        title: "All set!",
        description: "Your profile has been updated. Redirecting...",
      })

      router.push('/dashboard')
    } catch (error) {
      console.error('Failed to update profile:', error)
      toast({
        title: "Something went wrong",
        description: "Failed to save your preferences. Please try again.",
        variant: "destructive"
      })
    }
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
            totalSteps={5}
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
            totalSteps={5}
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
            totalSteps={5}
          />
        )
      case 4:
        return <StepFinal onComplete={handleComplete} isLoading={isLoading} />
      default:
        return null
    }
  }

  return (
    <OnboardingLayout
      currentStep={currentStepIndex}
      totalSteps={5}
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
