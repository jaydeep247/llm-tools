"use client"

import { useState } from "react"
import Link from "next/link"
import { Search, Eye } from "lucide-react"

const mockAccounts = [
  { id: 1, name: "Acme Corp", plan: "Enterprise", mrr: 5200, industry: "Finance", region: "US", activeUsers: 156, adoption: 94, churnRisk: "Low" },
  { id: 2, name: "TechFlow Inc", plan: "Pro", mrr: 2800, industry: "SaaS", region: "US", activeUsers: 89, adoption: 78, churnRisk: "Low" },
  { id: 3, name: "CloudNine Ltd", plan: "Enterprise", mrr: 4900, industry: "Cloud", region: "EU", activeUsers: 234, adoption: 89, churnRisk: "Low" },
  { id: 4, name: "DataViz Systems", plan: "Pro", mrr: 1800, industry: "Analytics", region: "US", activeUsers: 45, adoption: 62, churnRisk: "Medium" },
  { id: 5, name: "AI Solutions Group", plan: "Enterprise", mrr: 3500, industry: "AI/ML", region: "APAC", activeUsers: 178, adoption: 85, churnRisk: "Low" },
  { id: 6, name: "Quantum Labs", plan: "Free", mrr: 0, industry: "Research", region: "EU", activeUsers: 12, adoption: 34, churnRisk: "High" },
  { id: 7, name: "MarketPulse", plan: "Pro", mrr: 2100, industry: "Marketing", region: "US", activeUsers: 67, adoption: 71, churnRisk: "Low" },
  { id: 8, name: "SecureNet Pro", plan: "Enterprise", mrr: 6100, industry: "Security", region: "US", activeUsers: 298, adoption: 91, churnRisk: "Low" },
  { id: 9, name: "RetailMax", plan: "Pro", mrr: 1500, industry: "Retail", region: "US", activeUsers: 34, adoption: 45, churnRisk: "High" },
  { id: 10, name: "HealthTech Connect", plan: "Pro", mrr: 2900, industry: "Healthcare", region: "EU", activeUsers: 112, adoption: 79, churnRisk: "Low" },
]

export default function AccountsPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [planFilter, setPlanFilter] = useState("all")
  const [sortBy, setSortBy] = useState("name")

  const filteredAccounts = mockAccounts.filter((account) => {
    const matchesSearch = account.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesPlan = planFilter === "all" || account.plan === planFilter
    return matchesSearch && matchesPlan
  })

  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    if (sortBy === "mrr") return b.mrr - a.mrr
    if (sortBy === "adoption") return b.adoption - a.adoption
    if (sortBy === "activeUsers") return b.activeUsers - a.activeUsers
    return a.name.localeCompare(b.name)
  })

  const getRiskColor = (risk: string) => {
    if (risk === "Low") return "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300"
    if (risk === "Medium") return "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300"
    return "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Accounts & Users</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage and monitor customer accounts</p>
      </div>

      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Plans</option>
            <option value="Free">Free</option>
            <option value="Pro">Pro</option>
            <option value="Enterprise">Enterprise</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
          >
            <option value="name">Sort by Name</option>
            <option value="mrr">Sort by MRR</option>
            <option value="adoption">Sort by Adoption</option>
            <option value="activeUsers">Sort by Active Users</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Account Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">MRR</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Industry</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Region</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Active Users</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Adoption</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Churn Risk</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
              {sortedAccounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{account.name}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      account.plan === "Enterprise" ? "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300" :
                      account.plan === "Pro" ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300" :
                      "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}>
                      {account.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">${account.mrr.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{account.industry}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{account.region}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{account.activeUsers}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{account.adoption}%</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskColor(account.churnRisk)}`}>
                      {account.churnRisk}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <Link href={`/admin/accounts/${account.id}`} className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
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
          Showing {sortedAccounts.length} of {mockAccounts.length} accounts
        </div>
      </div>
    </div>
  )
}
