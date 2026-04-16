"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import Script from "next/script"
import { useGoogleAuthMutation, useLoginMutation, useSignupMutation } from "@/store/api/authApi"
import { useRouter } from "next/navigation"
import { AuthResponse, UserRole } from "@/types/auth"
import Link from "next/link"
import { getOnboardingResumePath, requiresOnboarding } from "@/lib/onboarding"

import { DummyDashboard } from "@/components/shared/DummyDashboard"

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential?: string }) => void
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black"
              size?: "large" | "medium" | "small"
              text?: "signin_with" | "signup_with" | "continue_with" | "signin"
              shape?: "rectangular" | "pill" | "circle" | "square"
              width?: number
              logo_alignment?: "left" | "center"
            },
          ) => void
          cancel: () => void
        }
      }
    }
  }
}

export default function SigninClient() {
  const router = useRouter()
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  // ── Mutation hooks (declared first so refs below can reference them) ──
  const [login, { isLoading: isLoginLoading }] = useLoginMutation()
  const [signup, { isLoading: isSignupLoading }] = useSignupMutation()
  const [googleAuth] = useGoogleAuthMutation()

  // ── Refs ──────────────────────────────────────────────────────────────
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  // Whether GSI has been initialised — used by the toggle effect to know it
  // can call renderButton without calling initialize() again.
  const googleInitializedRef = useRef(false)
  // Stable mirror of isLogin for the GSI callback closure (avoids the closure
  // capturing a stale value and requiring isLogin in Effect 2 deps).
  const isLoginRef = useRef(true)
  // Stable ref to the googleAuth trigger so Effect 2 never needs it as a dep.
  // RTK Query already memoises the trigger, but this removes all ambiguity.
  const googleAuthRef = useRef(googleAuth)
  useEffect(() => { googleAuthRef.current = googleAuth }, [googleAuth])

  // ── State ─────────────────────────────────────────────────────────────
  const [isLogin, setIsLogin] = useState(true)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isGoogleScriptLoaded, setIsGoogleScriptLoaded] = useState(false)
  // Manual in-flight flag for the Google auth network call — intentionally
  // separate from RTK Query's loading state so we can block the UI without
  // touching the GSI button container's classNames (changing those triggers
  // GSI's internal MutationObserver, causing the iframe to re-render/blink).
  const [isGoogleAuthInFlight, setIsGoogleAuthInFlight] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: UserRole.ANALYST,
  })
  const [error, setError] = useState<string>("")

  const toggleLoginSignup = () => {
    setIsTransitioning(true)
    setError("") // Clear error when switching
    setTimeout(() => {
      setIsLogin(!isLogin)
      setIsTransitioning(false)
    }, 150)
  }

  const getErrorMessage = (err: any): string => {
    const raw =
      err?.data?.message ||
      err?.error ||
      err?.message ||
      (typeof err === "string" ? err : "")

    if (!raw) {
      return "An error occurred. Please try again."
    }

    if (
      typeof raw === "string" &&
      raw.includes("Unexpected token") &&
      raw.toLowerCase().includes("json")
    ) {
      if (raw.toLowerCase().includes("too many")) {
        return "Too many requests. Please try again later."
      }
      return "The server returned an invalid response. Please try again."
    }

    return raw
  }

  const handleAuthSuccess = useCallback((response: AuthResponse) => {
    if (requiresOnboarding(response.user)) {
      router.replace(getOnboardingResumePath(response.user))
      return
    }
    router.replace("/dashboard")
  }, [router])

  // Stable ref so the GSI callback (created once in Effect 2) always calls
  // the latest version of handleAuthSuccess without needing it in the deps.
  const handleAuthSuccessRef = useRef(handleAuthSuccess)
  useEffect(() => { handleAuthSuccessRef.current = handleAuthSuccess }, [handleAuthSuccess])

  // ── Effect 1: keep isLoginRef in sync and re-render the button text when
  // the user toggles modes. Never calls initialize() again — no GSI re-init,
  // no button flicker.
  useEffect(() => {
    isLoginRef.current = isLogin
    if (
      !googleInitializedRef.current ||
      !googleButtonRef.current ||
      !window.google?.accounts?.id
    ) return

    googleButtonRef.current.innerHTML = ""
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      text: isLogin ? "signin_with" : "signup_with",
      shape: "pill",
      width: Math.max(320, googleButtonRef.current.offsetWidth || 320),
      logo_alignment: "left",
    })
  }, [isLogin])

  // ── Effect 2: initialise GSI exactly once when the script becomes ready.
  // googleAuth and handleAuthSuccess are accessed via stable refs so they
  // never need to appear in the dependency array (no re-init on re-renders).
  useEffect(() => {
    if (
      !googleClientId ||
      !isGoogleScriptLoaded ||
      !window.google?.accounts?.id ||
      !googleButtonRef.current
    ) return

    googleButtonRef.current.innerHTML = ""
    googleInitializedRef.current = true

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        if (!response.credential) {
          setError("Google sign-in failed. Please try again.")
          return
        }
        setError("")
        setIsGoogleAuthInFlight(true)
        try {
          const authResponse = await googleAuthRef.current({
            idToken: response.credential,
          }).unwrap()
          // Navigate away on success — no need to clear isGoogleAuthInFlight
          // since the component unmounts during navigation.
          handleAuthSuccessRef.current(authResponse)
        } catch (err: any) {
          // Clear the flag on error so the user can retry.
          setIsGoogleAuthInFlight(false)
          setError(getErrorMessage(err))
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      text: isLoginRef.current ? "signin_with" : "signup_with",
      shape: "pill",
      width: Math.max(320, googleButtonRef.current.offsetWidth || 320),
      logo_alignment: "left",
    })

    return () => {
      window.google?.accounts.id.cancel()
      googleInitializedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId, isGoogleScriptLoaded])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      if (isLogin) {
        const response = await login({
          email: formData.email,
          password: formData.password,
        }).unwrap()
        handleAuthSuccess(response)
      } else {
        const response = await signup({
          email: formData.email,
          password: formData.password,
          name: formData.name || "User",
          role: formData.role,
        }).unwrap()
        handleAuthSuccess(response)
      }
    } catch (err: any) {
      const errorMessage = getErrorMessage(err)

      // If the email belongs to a Google-only account, auto-switch to login
      // mode and surface a clear message so the user knows what to do next.
      const isGoogleConflict =
        errorMessage.includes('already exists') &&
        (errorMessage.toLowerCase().includes('google') || errorMessage.toLowerCase().includes('sign in using google'))
      if (isGoogleConflict && !isLogin) {
        setIsTransitioning(true)
        setTimeout(() => {
          setIsLogin(true)
          setIsTransitioning(false)
          setError('This email is already registered with Google. Please use "Continue with Google" or fill in your password below.')
        }, 150)
      } else {
        setError(errorMessage)
      }

      if (process.env.NODE_ENV === "development") {
        console.warn("Auth warning:", errorMessage)
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <div className="h-screen w-full bg-brand-surface relative overflow-hidden">
      {/* Light-mode dummy dashboard background */}
      <DummyDashboard />

      {/* Dark overlay so modal pops against the dashboard */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] z-10" />

      {/* Centered auth card */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 sm:p-8">
      {googleClientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => {
            setIsGoogleScriptLoaded(true)
          }}
          onReady={() => {
            setIsGoogleScriptLoaded(true)
          }}
          onError={() => {
            setError("Failed to load Google sign-in. Please try again or use email and password.")
          }}
        />
      )}

      <Link href="/" className="mb-5 text-white/70 hover:text-white font-medium transition-colors text-sm">
        &larr; Back to Home
      </Link>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl ring-1 ring-black/6 overflow-hidden">
        <div className="px-7 sm:px-10 py-7 sm:py-8">
          {/* Header */}
          <div className={`text-center mb-6 transition-all duration-300 ${
            isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}>
            <h2 className="text-xl font-bold text-brand-charcoal mb-1.5">
              {isLogin ? "Welcome Back" : "Get Started"}
            </h2>
            <p className="text-sm text-brand-muted">
              {isLogin 
                ? "Sign in to access your Contentlytics dashboard" 
                : "Create your account to start analyzing"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {!isLogin && (
              <div className={`transition-all duration-300 ${
                isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              }`}>
                <label htmlFor="name" className="block text-sm font-medium text-brand-charcoal mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-white border border-brand-warm rounded-xl text-sm text-brand-charcoal placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent transition-all"
                  placeholder="John Doe"
                  required={!isLogin}
                />
              </div>
            )}

            {!isLogin && (
              <div className={`transition-all duration-300 ${
                isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              }`}>
                <label htmlFor="role" className="block text-sm font-medium text-brand-charcoal mb-1.5">
                  Role
                </label>
                <div className="relative">
                  <select
                    id="role"
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-white border border-brand-warm rounded-xl text-sm text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent transition-all appearance-none cursor-pointer"
                    required={!isLogin}
                  >
                    <option value={UserRole.CXO}>CXO</option>
                    <option value={UserRole.CMO}>CMO</option>
                    <option value={UserRole.SEO_MANAGER}>SEO Manager</option>
                    <option value={UserRole.CONTENT_MANAGER}>Content Manager</option>
                    <option value={UserRole.ANALYST}>Analyst</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                    <svg className="w-4 h-4 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            <div className={`transition-all duration-300 ${
              isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
            }`}>
              <label htmlFor="email" className="block text-sm font-medium text-brand-charcoal mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-white border border-brand-warm rounded-xl text-sm text-brand-charcoal placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent transition-all"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className={`transition-all duration-300 ${
              isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
            }`}>
              <label htmlFor="password" className="block text-sm font-medium text-brand-charcoal mb-1.5">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-white border border-brand-warm rounded-xl text-sm text-brand-charcoal placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            {isLogin && (
              <div className={`flex items-center justify-between text-sm transition-all duration-300 ${
                isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              }`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-brand-warm text-brand-orange focus:ring-brand-orange cursor-pointer"
                  />
                  <span className="text-brand-muted">Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-brand-orange hover:text-brand-orange-hover font-medium transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoginLoading || isSignupLoading}
              className={`w-full py-3 bg-brand-orange text-white rounded-full text-sm font-semibold hover:bg-brand-orange-hover transition-all duration-300 shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 ${
                isTransitioning ? "opacity-50" : "opacity-100"
              }`}
            >
              {(isLoginLoading || isSignupLoading) && (
                <Loader2 className="w-5 h-5 animate-spin" />
              )}
              {isLogin ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-brand-warm" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-brand-muted">Or continue with</span>
            </div>
          </div>

          {/*
           * ── Google button section ───────────────────────────────────
           * Fixed-height wrapper (h-11 = 44px) reserves the exact space
           * occupied by the button so the card NEVER reflowes.
           * Both skeleton and GSI target are absolutely positioned inside
           * it — neither adds to document flow. They cross-fade via
           * opacity transitions so height stays constant throughout.
           *
           * Why opacity instead of hidden/conditional render:
           *  • display:none (hidden) → offsetWidth=0, card shrinks → shift
           *  • mount/unmount → card jumps twice (skeleton out, button in)
           *  • opacity fade keeps the wrapper at 44px at all times
           *
           * MutationObserver safety: the one-time opacity-0 → opacity-100
           * transition on googleButtonRef fires BEFORE renderButton()
           * injects the iframe, so no GSI observer exists yet on that node.
           * After init the className on this div never changes. ✓
           */}
          <div className="relative h-11">
            {/* Skeleton — fades out when GSI is ready. Stays in the DOM
                (just invisible) so there is no layout contribution change. */}
            {googleClientId && (
              <div
                aria-hidden={isGoogleScriptLoaded}
                className={`absolute inset-0 flex items-center justify-center gap-2 bg-white border border-brand-warm rounded-xl transition-opacity duration-200 ${
                  isGoogleScriptLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}
              >
                <Loader2 className="w-4 h-4 animate-spin text-brand-muted" />
                <span className="text-sm text-brand-muted">Loading Google Sign-In…</span>
              </div>
            )}

            {/* GSI button target — React renders NO children here.
                Owned exclusively by the GSI library after initialization.
                Fades in once (opacity-0 → opacity-100) during first load,
                then className is stable for the lifetime of the component. */}
            <div
              ref={googleButtonRef}
              className={`absolute inset-0 transition-opacity duration-200 ${
                isGoogleScriptLoaded ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            />

            {/* No-client-id fallback */}
            {!googleClientId && (
              <div className="absolute inset-0">
                <button
                  type="button"
                  onClick={() => setError("Google sign-in is unavailable right now. Please use email and password.")}
                  className="flex w-full h-full items-center justify-center gap-2 px-4 bg-white border border-brand-warm rounded-xl hover:bg-brand-surface transition-all duration-200 cursor-pointer"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span className="text-sm font-medium text-brand-charcoal">Continue with Google</span>
                </button>
              </div>
            )}

            {/* In-flight overlay — shown after the user picks an account
                and we're awaiting the backend. Positioned as a sibling
                overlay so the GSI iframe is untouched and doesn't blink. */}
            {isGoogleAuthInFlight && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-brand-charcoal" />
              </div>
            )}
          </div>

          {/* Toggle Login/Signup */}
          <div className={`mt-6 text-center text-sm transition-all duration-300 ${
            isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}>
            <span className="text-brand-muted">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
            </span>{" "}
            <button
              type="button"
              onClick={toggleLoginSignup}
              className="text-brand-orange hover:text-brand-orange-hover font-semibold transition-colors cursor-pointer"
            >
              {isLogin ? "Sign Up" : "Sign In"}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
