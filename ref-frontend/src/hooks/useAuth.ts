'use client'

import { useState, useCallback, useEffect } from 'react'

// Create a singleton state that persists across component instances
let globalAuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null as any,
  initialized: false,
}

let authCheckPromise: Promise<void> | null = null
const listeners = new Set<(state: typeof globalAuthState) => void>()

// Function to notify all listeners of state changes
function notifyListeners() {
  listeners.forEach(listener => listener(globalAuthState))
}

// Function to check auth status (called once globally)
async function checkAuthStatus() {
  if (authCheckPromise) {
    return authCheckPromise
  }

  authCheckPromise = (async () => {
    try {
      const response = await fetch('/api/auth/status', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        globalAuthState = {
          isAuthenticated: data.authenticated === true,
          isLoading: false,
          user: data.user || null,
          initialized: true,
        }
      } else {
        globalAuthState = {
          isAuthenticated: false,
          isLoading: false,
          user: null,
          initialized: true,
        }
      }
    } catch (error) {
      console.error('[useAuth] Error checking auth status:', error)
      globalAuthState = {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        initialized: true,
      }
    } finally {
      notifyListeners()
      authCheckPromise = null
    }
  })()

  return authCheckPromise
}

// Initialize auth check immediately when module loads (client-side only)
if (typeof window !== 'undefined' && !globalAuthState.initialized) {
  checkAuthStatus()
}

export function useAuth() {
  const [state, setState] = useState(globalAuthState)
  const [mounted, setMounted] = useState(false)

  // Handle hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Subscribe to auth state changes
  useEffect(() => {
    const listener = (newState: typeof globalAuthState) => {
      setState({ ...newState })
    }
    listeners.add(listener)
    
    // If not initialized, trigger check
    if (!globalAuthState.initialized) {
      checkAuthStatus()
    }
    
    return () => {
      listeners.delete(listener)
    }
  }, [])

  // Function to manually refresh auth status
  const refreshAuth = useCallback(() => {
    globalAuthState.isLoading = true
    notifyListeners()
    return checkAuthStatus()
  }, [])

  return { 
    isAuthenticated: mounted ? state.isAuthenticated : false,
    isLoading: mounted ? state.isLoading : true,
    user: mounted ? state.user : null,
    refreshAuth
  }
}
