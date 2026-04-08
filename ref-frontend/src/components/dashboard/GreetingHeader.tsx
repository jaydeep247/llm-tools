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

  // Get real name
  const displayName = user?.name || user?.email?.split('@')[0] || 'User'

  return (
    <div className="relative overflow-hidden rounded-xl bg-indigo-50 border border-indigo-100 p-6 sm:p-8 mb-6 sm:mb-8">
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-xl font-extralight text-foreground tracking-tight">
            Welcome back to dashboard!
            </h1>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
            {greeting}, {displayName}
          </h1>
          <p className="text-muted-foreground max-w-xl text-sm sm:text-base">
            Track your projects, manage sessions, and monitor your usage all in one place.
          </p>
        </div>
      </div>
      
      {/* Decorative background elements */}
      <div className="absolute top-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
    </div>
  )
}
