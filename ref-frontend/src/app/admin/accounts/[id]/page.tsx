"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, AlertCircle, CheckCircle } from "lucide-react"

// Mock account details
const accountDetails: Record<string, {
  name: string
  plan: string
  status: string
  signupDate: string
  healthScore: number
  churnRisk: string
  mrr: number
  dau: number
  adoption: number
  sessions30d: number
  features: string[]
  entities: string[]
  citationRate: number
  schemaUsage: number
  recommendationAcceptance: number
  lastActivity: string
  renewalDate: string
  paymentStatus: string
  acv: number
  errors: number
  failedJobs: number
  crawlFailures: number
}> = {
  1: {
    name: "Acme Corp",
    plan: "Enterprise",
    status: "Active",
    signupDate: "2021-03-15",
    healthScore: 94,
    churnRisk: "Low",
    mrr: 5200,
    dau: 234,
    adoption: 94,
    sessions30d: 2841,
    features: ["Advanced Search", "Analytics", "API Access", "Custom Reports"],
    entities: ["Company", "Product", "Person", "Location"],
    citationRate: 87,
    schemaUsage: 94,
    recommendationAcceptance: 79,
    lastActivity: "2024-02-19",
    renewalDate: "2024-03-15",
    paymentStatus: "OK",
    acv: 62400,
    errors: 3,
    failedJobs: 0,
    crawlFailures: 1,
  },
}

export default function AccountDetailPage() {
  const params = useParams()
  const accountId = params?.id as string | undefined
  const account = accountId ? accountDetails[accountId] : undefined

  if (!account) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6 text-center">
          <p className="text-gray-600 dark:text-gray-400">Account not found</p>
          <Link href="/admin/accounts" className="text-blue-600 dark:text-blue-400 hover:underline mt-4 inline-block">
            Back to accounts
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/accounts" className="p-2 hover:bg-gray-100 dark:hover:bg-[#1F1F23] rounded-lg">
          <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{account.name}</h1>
          <p className="text-gray-600 dark:text-gray-400">Enterprise Account Details</p>
        </div>
      </div>

      {/* Top Summary Card */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Plan Level</h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{account.plan}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Health Score</h3>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{account.healthScore}/100</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Current MRR</h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white">${account.mrr.toLocaleString()}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Status</h3>
            <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">
              {account.status}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Snapshot */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Usage Snapshot</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Sessions (30 days)</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.sessions30d}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Daily Active Users</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.dau}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Feature Adoption</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.adoption}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Last Activity</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.lastActivity}</span>
            </div>
          </div>
        </div>

        {/* AI Quality Snapshot */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">AI Quality Metrics</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Citation Rate</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.citationRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Schema Coverage</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.schemaUsage}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Recommendation Acceptance</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.recommendationAcceptance}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Entities Used</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.entities.length}</span>
            </div>
          </div>
        </div>

        {/* Revenue Signals */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Revenue Signals</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Renewal Date</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.renewalDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Payment Status</span>
              <span className="font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" /> {account.paymentStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Annual Contract Value</span>
              <span className="font-medium text-gray-900 dark:text-white">${account.acv.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* System Issues */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Issues</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Errors</span>
              <span className={`font-medium flex items-center gap-1 ${account.errors > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"}`}>
                {account.errors > 0 && <AlertCircle className="h-4 w-4" />}
                {account.errors}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Failed Jobs</span>
              <span className="font-medium text-green-600 dark:text-green-400">{account.failedJobs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Crawl Failures</span>
              <span className="font-medium text-gray-900 dark:text-white">{account.crawlFailures}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Features & Entities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Using Features</h2>
          <div className="space-y-2">
            {account.features.map((feature) => (
              <div key={feature} className="flex items-center gap-2 p-2 rounded bg-gray-50 dark:bg-[#1F1F23]">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Entities</h2>
          <div className="space-y-2">
            {account.entities.map((entity) => (
              <div key={entity} className="flex items-center gap-2 p-2 rounded bg-gray-50 dark:bg-[#1F1F23]">
                <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{entity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Admin Actions</h2>
        <div className="flex gap-3 flex-wrap">
          <button className="px-4 py-2 rounded-lg bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 text-sm font-medium hover:bg-yellow-200 dark:hover:bg-yellow-900">
            Flag as At Risk
          </button>
          <button className="px-4 py-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900">
            Assign to Team
          </button>
          <button className="px-4 py-2 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-900">
            Trigger Outreach
          </button>
          <button className="px-4 py-2 rounded-lg bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900">
            Override Recommendations
          </button>
        </div>
      </div>
    </div>
  )
}
