"use client"

import { useState, useEffect } from "react"
import { X, Loader2 } from "lucide-react"
import { useLoginMutation, useSignupMutation } from "@/store/api/authApi"
import { useRouter } from "next/navigation"
import { UserRole } from "@/types/auth"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: UserRole.ANALYST, // Default role
  })
  const [error, setError] = useState<string>("")

  const [login, { isLoading: isLoginLoading }] = useLoginMutation()
  const [signup, { isLoading: isSignupLoading }] = useSignupMutation()

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }

    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  // ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose()
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen])

  const handleClose = () => {
    setIsAnimating(false)
    setTimeout(() => {
      onClose()
    }, 200)
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      if (isLogin) {
        // Login (token stored in localStorage by authApi)
        const response = await login({
          email: formData.email,
          password: formData.password,
        }).unwrap()

        // Close modal
        handleClose()
        
        // Check for onboarding
        if (response.user.hasNew) {
            router.push('/onboarding')
            return
        }

        // Call onSuccess callback if provided, otherwise redirect
        if (onSuccess) {
          onSuccess()
        } else {
          router.push('/dashboard')
        }
      } else {
        // Signup
        const response = await signup({
          email: formData.email,
          password: formData.password,
          name: formData.name || "User",
          role: formData.role,
        }).unwrap()

        // Close modal
        handleClose()
        
        // Check for onboarding (should be true for new users)
        if (response.user.hasNew) {
            router.push('/onboarding')
            return
        }

        // Call onSuccess callback if provided, otherwise redirect
        if (onSuccess) {
          onSuccess()
        } else {
          router.push('/dashboard')
        }
      }
    } catch (err: any) {
      const errorMessage = getErrorMessage(err)

      setError(errorMessage)

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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200 cursor-pointer ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className={`relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden transition-all duration-200 ${
        isAnimating ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"
      }`}>
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors z-10 cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Content */}
        <div className="p-8">
          {/* Header */}
          <div className={`text-center mb-8 transition-all duration-300 ${
            isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {isLogin ? "Welcome Back" : "Get Started"}
            </h2>
            <p className="text-slate-600">
              {isLogin 
                ? "Sign in to access your Contentlytics dashboard" 
                : "Create your account to start analyzing"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
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
              className={`w-full py-3 bg-slate-900 text-white rounded-full font-semibold hover:bg-slate-800 transition-all duration-300 hover:scale-105 shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 ${
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

          {/* Social Login */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
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
              <span className="text-sm font-medium text-slate-700">Google</span>
            </button>

            <button
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all duration-200 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span className="text-sm font-medium text-slate-700">Facebook</span>
            </button>
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
