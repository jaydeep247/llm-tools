'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminLoginMutation } from '@/store/api/adminAuthApi'
import { Shield, Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [adminLogin, { isLoading }] = useAdminLoginMutation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    try {
      await adminLogin({ email, password }).unwrap()
      router.push('/admin/overview')
    } catch (err: any) {
      const msg =
        err?.data?.message ?? err?.message ?? 'Login failed. Please check your credentials.'
      setError(msg)
    }
  }

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center px-4">
      {/* Background grid */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-[#0F0F11] border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-indigo-400" />
            </div>
            <h1 className="text-xl font-semibold text-white">Admin Portal</h1>
            <p className="text-sm text-zinc-500 mt-1">Restricted access — authorised personnel only</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 mb-6 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@llm.com"
                  className="w-full bg-zinc-900/60 border border-zinc-700/60 text-white placeholder:text-zinc-600 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-indigo-500/60 focus:bg-zinc-900 transition-all duration-200"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-900/60 border border-zinc-700/60 text-white placeholder:text-zinc-600 rounded-xl pl-10 pr-10 py-2.5 text-sm outline-none focus:border-indigo-500/60 focus:bg-zinc-900 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-xl py-2.5 text-sm transition-all duration-200 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Authenticating…
                </span>
              ) : (
                'Sign in to Admin'
              )}
            </button>
          </form>

          {/* Footer note */}
          <p className="text-center text-xs text-zinc-600 mt-6">
            This login is exclusively for system administrators.
            <br />
            Unauthorised access attempts are logged.
          </p>
        </div>
      </div>
    </div>
  )
}
