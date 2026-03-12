'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  Eye,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  AlertCircle,
} from 'lucide-react'
import {
  useAdminListUsersQuery,
  type AdminUser,
  type AdminUserRole,
} from '@/store/api/admin/adminUsersApi'

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_ROLES: AdminUserRole[] = [
  'CXO', 'CMO', 'SEO_MANAGER', 'CONTENT_MANAGER', 'ANALYST',
]

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

type SortKey = 'name' | 'email' | 'role' | 'createdAt'

// ─── Sub-components ──────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: AdminUserRole }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${ROLE_BADGE[role]}`}>
      {ROLE_LABEL[role]}
    </span>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUp className="w-3 h-3 text-zinc-600" />
  return dir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-indigo-400" />
    : <ChevronDown className="w-3 h-3 text-indigo-400" />
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<AdminUserRole | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const { data: users, isLoading, isFetching, error, refetch } = useAdminListUsersQuery(
    roleFilter !== 'all'
      ? { role: roleFilter, search: search || undefined }
      : { search: search || undefined },
  )

  const sorted = useMemo(() => {
    if (!users) return []
    return [...users].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortKey === 'email') cmp = a.email.localeCompare(b.email)
      else if (sortKey === 'role') cmp = a.role.localeCompare(b.role)
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [users, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const thCls = 'px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider select-none'

  return (
    <div className="space-y-5 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Accounts & Users</h1>
          <p className="text-sm text-zinc-500 mt-0.5">View platform users</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-xl border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900/60 border border-zinc-800 text-white placeholder:text-zinc-600 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-indigo-500/60 transition-all"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as AdminUserRole | 'all')}
          className="bg-zinc-900/60 border border-zinc-800 text-zinc-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500/60 transition-all"
        >
          <option value="all">All Roles</option>
          {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>

      {/* Stats strip */}
      {users && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {ALL_ROLES.map((r) => {
            const count = users.filter((u) => u.role === r).length
            return (
              <button
                key={r}
                onClick={() => setRoleFilter((prev) => (prev === r ? 'all' : r))}
                className={`rounded-xl border px-3 py-2.5 text-center transition-all ${
                  roleFilter === r
                    ? 'border-indigo-500/40 bg-indigo-500/10'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600'
                }`}
              >
                <p className="text-xs text-zinc-500">{ROLE_LABEL[r]}</p>
                <p className="text-lg font-semibold text-white mt-0.5">{count}</p>
              </button>
            )
          })}
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
        {isLoading && (
          <div className="divide-y divide-zinc-800">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="px-4 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-zinc-800 rounded w-32" />
                  <div className="h-3 bg-zinc-800 rounded w-48" />
                </div>
                <div className="h-5 bg-zinc-800 rounded w-20" />
                <div className="h-3 bg-zinc-800 rounded w-24" />
              </div>
            ))}
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-zinc-400">Failed to load users</p>
            <button onClick={() => refetch()} className="text-sm text-indigo-400 hover:text-indigo-300 underline">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-900/80 border-b border-zinc-800">
                <tr>
                  <th className={thCls}>
                    <span className="flex items-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => toggleSort('name')}>
                      User <SortIcon active={sortKey === 'name'} dir={sortDir} />
                    </span>
                  </th>
                  <th className={thCls}>
                    <span className="flex items-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => toggleSort('role')}>
                      Role <SortIcon active={sortKey === 'role'} dir={sortDir} />
                    </span>
                  </th>
                  <th className={thCls}>Onboarding</th>
                  <th className={thCls}>
                    <span className="flex items-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => toggleSort('createdAt')}>
                      Joined <SortIcon active={sortKey === 'createdAt'} dir={sortDir} />
                    </span>
                  </th>
                  <th className={thCls}>Last Updated</th>
                  <th className={thCls}>View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-sm text-zinc-500">No users found</td>
                  </tr>
                ) : sorted.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center text-xs font-semibold text-indigo-300 shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{user.name}</p>
                          <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><RoleBadge role={user.role} /></td>
                    <td className="px-4 py-3.5">
                      {user.onboardingData?.organizationType ? (
                        <div className="text-xs text-zinc-400 space-y-0.5">
                          <p>{user.onboardingData.organizationType}</p>
                          {user.onboardingData.focusArea && (
                            <p className="text-zinc-600">{user.onboardingData.focusArea}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-400">
                      {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-500">
                      {new Date(user.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/admin/accounts/${user.id}`}
                        className="inline-flex items-center gap-1.5 p-1.5 rounded-lg text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all opacity-0 group-hover:opacity-100"
                        title="View"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !error && sorted.length > 0 && (
          <div className="border-t border-zinc-800 px-4 py-3">
            <p className="text-xs text-zinc-500">{sorted.length} user{sorted.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </div>
  )
}

