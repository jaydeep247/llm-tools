"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import Script from "next/script"
import { useGoogleAuthMutation, useLoginMutation, useSignupMutation } from "@/store/api/authApi"
import { useRouter } from "next/navigation"
import { AuthResponse, UserRole } from "@/types/auth"
import Link from "next/link"
import { getOnboardingResumePath, requiresOnboarding } from "@/lib/onboarding"

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
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  const [isLogin, setIsLogin] = useState(true)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isGoogleScriptLoaded, setIsGoogleScriptLoaded] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: UserRole.ANALYST, // Default role
  })
  const [error, setError] = useState<string>("")

  const [login, { isLoading: isLoginLoading }] = useLoginMutation()
  const [signup, { isLoading: isSignupLoading }] = useSignupMutation()
  const [googleAuth, { isLoading: isGoogleLoading }] = useGoogleAuthMutation()

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

  const handleAuthSuccess = (response: AuthResponse) => {
    if (requiresOnboarding(response.user)) {
      router.replace(getOnboardingResumePath(response.user))
      return
    }

    router.replace("/dashboard")
  }

  useEffect(() => {
    if (!googleClientId || !isGoogleScriptLoaded || !window.google?.accounts?.id || !googleButtonRef.current) {
      return
    }

    googleButtonRef.current.innerHTML = ""

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        if (!response.credential) {
          setError("Google sign-in failed. Please try again.")
          return
        }

        setError("")

        let retries = 0;
        const maxRetries = 2;
        const tryGoogleAuth = async () => {
          if (!response.credential) return;
          try {
            const authResponse = await googleAuth({
              idToken: response.credential,
            }).unwrap()

            handleAuthSuccess(authResponse)
          } catch (err: any) {
            if (retries < maxRetries && (err?.status === 'FETCH_ERROR' || err?.status === 502 || err?.status === 503 || err?.status === 504)) {
              retries++;
              setTimeout(tryGoogleAuth, 1000 * retries); // exponential backoff
            } else {
              setError(getErrorMessage(err))
            }
          }
        };
        tryGoogleAuth();
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      text: isLogin ? "signin_with" : "signup_with",
      shape: "pill",
      width: Math.max(320, googleButtonRef.current.offsetWidth || 320),
      logo_alignment: "left",
    })

    return () => {
      window.google?.accounts.id.cancel()
    }
  }, [googleAuth, googleClientId, isGoogleScriptLoaded, isLogin, router])

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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-8">
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

      <Link href="/" className="mb-8 text-slate-600 hover:text-slate-900 font-medium transition-colors">
        &larr; Back to Home
      </Link>

      <div className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden">
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className={`text-center mb-6 sm:mb-8 transition-all duration-300 ${
            isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
              {isLogin ? "Welcome Back" : "Get Started"}
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              {isLogin 
                ? "Sign in to access your Contentlytics dashboard" 
                : "Create your account to start analyzing"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
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
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  placeholder="John Doe"
                  required={!isLogin}
                />
              </div>
            )}

            {!isLogin && (
              <div className={`transition-all duration-300 ${
                isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              }`}>
                <label htmlFor="role" className="block text-sm font-medium text-slate-700 mb-2">
                  Role
                </label>
                <div className="relative">
                  <select
                    id="role"
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all appearance-none cursor-pointer"
                    required={!isLogin}
                  >
                    <option value={UserRole.CXO}>CXO</option>
                    <option value={UserRole.CMO}>CMO</option>
                    <option value={UserRole.SEO_MANAGER}>SEO Manager</option>
                    <option value={UserRole.CONTENT_MANAGER}>Content Manager</option>
                    <option value={UserRole.ANALYST}>Analyst</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            <div className={`transition-all duration-300 ${
              isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
            }`}>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className={`transition-all duration-300 ${
              isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
            }`}>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
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
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                  />
                  <span className="text-slate-600">Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-slate-900 hover:text-slate-700 font-medium transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoginLoading || isSignupLoading}
              className={`w-full py-3 bg-popover text-foreground rounded-full font-semibold hover:bg-slate-800 transition-all duration-300 hover:scale-105 shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 ${
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
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-500">Or continue with</span>
            </div>
          </div>

          <div className="relative">
            <div
              ref={googleButtonRef}
              className={`min-h-11 w-full flex items-center justify-center overflow-hidden rounded-xl ${
                isGoogleLoading ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {googleClientId && !isGoogleScriptLoaded && (
                <div className="flex w-full items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl h-11">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  <span className="text-sm font-medium text-slate-500">Loading...</span>
                </div>
              )}
            </div>

            {!googleClientId && (
              <button
                type="button"
                onClick={() => setError("Google sign-in is unavailable right now. Please use email and password.")}
                className="flex w-full items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="text-sm font-medium text-slate-700">Continue with Google</span>
              </button>
            )}

            {isGoogleLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-slate-700" />
              </div>
            )}
          </div>

          {/* Toggle Login/Signup */}
          <div className={`mt-6 text-center text-sm transition-all duration-300 ${
            isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}>
            <span className="text-slate-600">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
            </span>{" "}
            <button
              type="button"
              onClick={toggleLoginSignup}
              className="text-slate-900 hover:text-slate-700 font-semibold transition-colors cursor-pointer"
            >
              {isLogin ? "Sign Up" : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
