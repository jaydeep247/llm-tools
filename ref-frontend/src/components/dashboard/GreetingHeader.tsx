'use client'

import { useAuth } from '@/hooks/useAuth'
import { useEffect, useState } from 'react'

export function GreetingHeader() {
  const { user } = useAuth()
  const [greeting, setGreeting] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good Morning')
    else if (hour < 18) setGreeting('Good Afternoon')
    else setGreeting('Good Evening')
  }, [])

  if (!mounted) return null

  const displayName = user?.name || user?.email?.split('@')[0] || 'User'

  return (
    <div>
      <h1 className="nd-page-title">
        {greeting}, {displayName} 👋
      </h1>
      <p className="nd-page-subtitle">
        Here&apos;s what&apos;s happening with your projects today.
      </p>
    </div>
  )
}
