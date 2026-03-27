import type { User } from '@/types/auth'

export function hasCompletedOnboarding(user?: Pick<User, 'hasNew' | 'onboardingState'> | null): boolean {
  if (!user) {
    return false
  }

  if (user.onboardingState?.status) {
    return user.onboardingState.status === 'completed'
  }

  return user.hasNew === false
}

export function requiresOnboarding(user?: Pick<User, 'hasNew' | 'onboardingState'> | null): boolean {
  return !!user && !hasCompletedOnboarding(user)
}

export function getOnboardingResumePath(user?: Pick<User, 'onboardingState'> | null): string {
  const resumePath = user?.onboardingState?.resumePath?.trim()

  if (resumePath && resumePath.startsWith('/')) {
    return resumePath
  }

  return '/onboarding'
}