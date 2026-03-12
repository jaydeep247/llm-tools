'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react'
import {
  useAdminGetUserQuery,
  type AdminUserRole,
} from '@/store/api/admin/adminUsersApi'

const ROLE_LABEL: Record<AdminUserRole, string> = {
  CXO: 'CXO',
  CMO: 'CMO',
  SEO_MANAGER: 'SEO Manager',
  CONTENT_MANAGER: 'Content Manager',
  ANALYST: 'Analyst',
}

const ROLE_BADGE: Record<AdminUserRole, string> = {
  CXO: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  CMO: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  SEO_MANAGER: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  CONTENT_MANAGER: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  ANALYST: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25',
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function AccountDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const { data: user, isLoading, error, refetch } = useAdminGetUserQuery(id, { skip: !id })

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="py-10 space-y-4 animate-pulse">
        <div className="h-6 bg-zinc-800 rounded w-40" />
        <div className="h-36 bg-zinc-900/60 border border-zinc-800 rounded-2xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-48 bg-zinc-900/60 border border-zinc-800 rounded-2xl" />
          <div className="h-48 bg-zinc-900/60 border border-zinc-800 rounded-2xl" />
        </div>
      </div>
    )
  }

  // ── Error / not found ──
  if (error || !user) {
    return (
      <div className="py-10 flex flex-col items-center gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-zinc-400">User not found</p>
        <Link href="/admin/accounts" className="text-sm text-indigo-400 hover:text-indigo-300 underline">
          ← Back to accounts
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/accounts"
            className="p-2 rounded-xl border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{user.name}</h1>
            <p className="text-xs text-zinc-500">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-xl border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Profile Card */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center text-xl font-bold text-indigo-300 shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-white">{user.name}</h2>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${ROLE_BADGE[user.role]}`}>
                {ROLE_LABEL[user.role]}
              </span>
              {user.hasNew && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                  New
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400 mt-1">{user.email}</p>
            <div className="flex gap-6 mt-3">
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Joined</p>
                <p className="text-xs text-zinc-300 mt-0.5">{fmt(user.createdAt)}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Last Updated</p>
                <p className="text-xs text-zinc-300 mt-0.5">{fmt(user.updatedAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Profile Details */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Profile Details</h3>
          <div className="space-y-1">
            {[
              { label: 'Full Name', value: user.name },
              { label: 'Email', value: user.email },
              { label: 'Role', value: ROLE_LABEL[user.role] },
              { label: 'Has New', value: user.hasNew ? 'Yes' : 'No' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-zinc-800/60 last:border-0">
                <span className="text-xs text-zinc-500">{label}</span>
                <span className="text-sm text-zinc-200">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Onboarding Data */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Onboarding Data</h3>
          {user.onboardingData && Object.keys(user.onboardingData).length > 0 ? (
            <div className="space-y-3">
              {user.onboardingData.role && (
                <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60">
                  <span className="text-xs text-zinc-500">Self-reported Role</span>
                  <span className="text-sm text-zinc-200">{user.onboardingData.role}</span>
                </div>
              )}
              {user.onboardingData.organizationType && (
                <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60">
                  <span className="text-xs text-zinc-500">Organization Type</span>
                  <span className="text-sm text-zinc-200">{user.onboardingData.organizationType}</span>
                </div>
              )}
              {user.onboardingData.focusArea && (
                <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60">
                  <span className="text-xs text-zinc-500">Focus Area</span>
                  <span className="text-sm text-zinc-200">{user.onboardingData.focusArea}</span>
                </div>
              )}
              <div className="mt-3 p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Raw JSON</p>
                <pre className="text-xs text-zinc-400 overflow-auto">{JSON.stringify(user.onboardingData, null, 2)}</pre>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-24">
              <p className="text-sm text-zinc-600">No onboarding data</p>
            </div>
          )}
        </div>
      </div>

      {/* Account Summary */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-5">Account Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Plan Level</p>
            <p className="text-lg font-bold text-white">—</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Health Score</p>
            <p className="text-lg font-bold text-zinc-300">—</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Current MRR</p>
            <p className="text-lg font-bold text-white">—</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Status</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-700/40 text-zinc-400 border border-zinc-700/60">
              —
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Usage Snapshot */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Usage Snapshot</h3>
          <div className="space-y-1">
            {[
              { label: 'Sessions (30 days)', value: '—' },
              { label: 'Daily Active Users', value: '—' },
              { label: 'Feature Adoption', value: '—' },
              { label: 'Last Activity', value: '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-zinc-800/60 last:border-0">
                <span className="text-xs text-zinc-500">{label}</span>
                <span className="text-sm text-zinc-400">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Quality Metrics */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-5">AI Quality Metrics</h3>
          <div className="space-y-1">
            {[
              { label: 'Citation Rate', value: '—' },
              { label: 'Schema Coverage', value: '—' },
              { label: 'Recommendation Acceptance', value: '—' },
              { label: 'Entities Used', value: '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-zinc-800/60 last:border-0">
                <span className="text-xs text-zinc-500">{label}</span>
                <span className="text-sm text-zinc-400">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue Signals */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Revenue Signals</h3>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60">
              <span className="text-xs text-zinc-500">Renewal Date</span>
              <span className="text-sm text-zinc-400">—</span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60">
              <span className="text-xs text-zinc-500">Payment Status</span>
              <span className="text-sm text-zinc-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-zinc-600" />
                —
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60 last:border-0">
              <span className="text-xs text-zinc-500">Annual Contract Value</span>
              <span className="text-sm text-zinc-400">—</span>
            </div>
          </div>
        </div>

        {/* System Issues */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-5">System Issues</h3>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60">
              <span className="text-xs text-zinc-500">Errors</span>
              <span className="text-sm text-zinc-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-zinc-600" />
                —
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/60">
              <span className="text-xs text-zinc-500">Failed Jobs</span>
              <span className="text-sm text-zinc-400">—</span>
            </div>
            <div className="flex items-center justify-between py-2.5 last:border-0">
              <span className="text-xs text-zinc-500">Crawl Failures</span>
              <span className="text-sm text-zinc-400">—</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Using Features */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Using Features</h3>
          <div className="flex items-center justify-center h-20">
            <p className="text-sm text-zinc-600">No feature data</p>
          </div>
        </div>

        {/* Top Entities */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Top Entities</h3>
          <div className="flex items-center justify-center h-20">
            <p className="text-sm text-zinc-600">No entity data</p>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-5">Admin Actions</h3>
        <div className="flex gap-3 flex-wrap">
          <button className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20 text-sm font-medium hover:bg-amber-500/20 transition-all">
            Flag as At Risk
          </button>
          <button className="px-4 py-2 rounded-xl bg-blue-500/10 text-blue-300 border border-blue-500/20 text-sm font-medium hover:bg-blue-500/20 transition-all">
            Assign to Team
          </button>
          <button className="px-4 py-2 rounded-xl bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-sm font-medium hover:bg-indigo-500/20 transition-all">
            Trigger Outreach
          </button>
          <button className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-sm font-medium hover:bg-emerald-500/20 transition-all">
            Override Recommendations
          </button>
        </div>
      </div>
    </div>
  )
}