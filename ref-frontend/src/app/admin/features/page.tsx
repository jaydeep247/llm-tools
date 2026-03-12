"use client"

import { useState } from "react"
import Link from "next/link"
import { Eye } from "lucide-react"

// Mock features data
const mockFeatures = [
  { id: 1, name: "Advanced Search", accounts: 1240, avgUsage: 8.2, retention: 23, revenue: 28500, status: "Core" },
  { id: 2, name: "Real-time Collaboration", accounts: 910, avgUsage: 6.4, retention: 18, revenue: 19200, status: "Core" },
  { id: 3, name: "Custom Workflows", accounts: 640, avgUsage: 5.1, retention: 14, revenue: 12800, status: "Optional" },
  { id: 4, name: "API Integration", accounts: 1310, avgUsage: 9.2, retention: 31, revenue: 35600, status: "Core" },
  { id: 5, name: "Scheduled Reports", accounts: 820, avgUsage: 4.3, retention: 11, revenue: 9200, status: "Optional" },
  { id: 6, name: "Team Management", accounts: 1050, avgUsage: 7.8, retention: 22, revenue: 24800, status: "Core" },
  { id: 7, name: "Data Export", accounts: 780, avgUsage: 3.5, retention: 8, revenue: 5600, status: "Optional" },
  { id: 8, name: "Custom Branding", accounts: 450, avgUsage: 2.1, retention: 5, revenue: 3200, status: "Optional" },
  { id: 9, name: "Single Sign-On", accounts: 620, avgUsage: 6.7, retention: 19, revenue: 16800, status: "Core" },
  { id: 10, name: "Advanced Analytics", accounts: 890, avgUsage: 7.5, retention: 21, revenue: 22400, status: "Core" },
]

export default function FeaturesPage() {
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState("revenue")

  const filteredFeatures = mockFeatures.filter((feature) => {
    if (statusFilter === "all") return true
    return feature.status === statusFilter
  })

  const sortedFeatures = [...filteredFeatures].sort((a, b) => {
    if (sortBy === "revenue") return b.revenue - a.revenue
    if (sortBy === "retention") return b.retention - a.retention
    if (sortBy === "accounts") return b.accounts - a.accounts
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Feature Analytics</h1>
        <p className="text-gray-600 dark:text-gray-400">Track feature adoption and business impact</p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-4 flex gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Features</option>
          <option value="Core">Core Features</option>
          <option value="Optional">Optional Features</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
        >
          <option value="revenue">Sort by Revenue Impact</option>
          <option value="retention">Sort by Retention Lift</option>
          <option value="accounts">Sort by Accounts Using</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      {/* Features Table */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Feature Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Accounts Using</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Avg Usage</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Retention Lift %</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Revenue Impact</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
              {sortedFeatures.map((feature) => (
                <tr key={feature.id} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{feature.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{feature.accounts.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{feature.avgUsage}x/week</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="font-medium text-green-600 dark:text-green-400">+{feature.retention}%</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">${feature.revenue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      feature.status === "Core"
                        ? "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}>
                      {feature.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <Link href={`/admin/features/${feature.id}`} className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 dark:bg-[#1F1F23] px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
          Showing {sortedFeatures.length} of {mockFeatures.length} features
        </div>
      </div>

      {/* Key Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Total Revenue Impact</h3>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">${mockFeatures.reduce((sum, f) => sum + f.revenue, 0).toLocaleString()}</div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">From all tracked features</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Avg Retention Lift</h3>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">+{Math.round(mockFeatures.reduce((sum, f) => sum + f.retention, 0) / mockFeatures.length)}%</div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Across all features</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Core vs Optional</h3>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{mockFeatures.filter(f => f.status === "Core").length} Core / {mockFeatures.filter(f => f.status === "Optional").length} Optional</div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Feature classification</p>
        </div>
      </div>
    </div>
  )
}
