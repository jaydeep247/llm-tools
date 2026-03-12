"use client"

import { ChartContainer } from "@/components/admin/chart-container"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { TrendingUp, Clock, Target } from "lucide-react"

// Mock data
const conversionPatterns = [
  { rank: 1, pattern: "Quick Onboarding", description: "Complete onboarding in <5 min", impact: 34, accounts: 234 },
  { rank: 2, pattern: "Social Proof", description: "Show team count early", impact: 28, accounts: 189 },
  { rank: 3, pattern: "Free Trial Extension", description: "Offer 14-day trial vs 7-day", impact: 23, accounts: 156 },
  { rank: 4, pattern: "Personal Demo", description: "Schedule 1-on-1 demo", impact: 41, accounts: 89 },
  { rank: 5, pattern: "Usage Incentives", description: "Bonus credits on signup", impact: 19, accounts: 142 },
]

const retentionPatterns = [
  { rank: 1, pattern: "First Feature Usage", description: "Active feature use within 3 days", impact: 38, accounts: 312 },
  { rank: 2, pattern: "Team Collaboration", description: "Invite 2+ team members", impact: 45, accounts: 267 },
  { rank: 3, pattern: "Integration Setup", description: "Connect API/integration early", impact: 31, accounts: 198 },
  { rank: 4, pattern: "Weekly Check-in", description: "CS check-in at day 7", impact: 26, accounts: 145 },
  { rank: 5, pattern: "Custom Config", description: "Setup >50% of config options", impact: 33, accounts: 201 },
]

const upsellPatterns = [
  { rank: 1, pattern: "Usage-Based Upsell", description: "Prompt when hitting limits", impact: 52, accounts: 234 },
  { rank: 2, pattern: "Feature Unlock", description: "Premium features after trial", impact: 38, accounts: 156 },
  { rank: 3, pattern: "Team Growth", description: "Upsell on inviting users", impact: 44, accounts: 198 },
  { rank: 4, pattern: "Power User Path", description: "Identify power users day 5", impact: 34, accounts: 123 },
  { rank: 5, pattern: "Success Stories", description: "Show customer win stories", impact: 27, accounts: 89 },
]

const patternTrendData = [
  { month: "Jan", quick: 18, collab: 22, integration: 15, check: 12 },
  { month: "Feb", quick: 22, collab: 25, integration: 18, check: 14 },
  { month: "Mar", quick: 26, collab: 29, integration: 21, check: 16 },
  { month: "Apr", quick: 31, collab: 35, integration: 25, check: 19 },
  { month: "May", quick: 34, collab: 38, integration: 31, check: 23 },
  { month: "Jun", quick: 38, collab: 45, integration: 31, check: 26 },
]

const recommendedActions = [
  { pattern: "Quick Onboarding", status: "Not implemented", priority: "High", impact: "34% conversion lift", action: "Implement" },
  { pattern: "Team Collaboration", status: "Partially implemented", priority: "High", impact: "45% retention lift", action: "Complete" },
  { pattern: "Usage-Based Upsell", status: "Implemented", priority: "Medium", impact: "52% upsell lift", action: "Optimize" },
  { pattern: "Integration Setup", status: "Not implemented", priority: "High", impact: "31% retention lift", action: "Implement" },
  { pattern: "Personal Demo", status: "Not implemented", priority: "Medium", impact: "41% conversion lift", action: "Plan" },
]

export default function PatternsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Winning Patterns</h1>
        <p className="text-gray-600 dark:text-gray-400">Discover and analyze successful user journey patterns</p>
      </div>

      {/* Pattern Category Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Conversion Patterns</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">+34%</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Best pattern lift</p>
            </div>
            <Target className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Retention Patterns</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">+45%</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Best pattern lift</p>
            </div>
            <Clock className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Upsell Patterns</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">+52%</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Best pattern lift</p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
      </div>

      {/* Pattern Trends */}
      <ChartContainer title="Pattern Adoption Trend" description="Implementation rate of top patterns over time">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={patternTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip contentStyle={{ backgroundColor: "#0f0f12", border: "1px solid #1f1f23", borderRadius: "8px" }} />
            <Legend />
            <Line type="monotone" dataKey="quick" stroke="#3b82f6" strokeWidth={2} name="Quick Onboarding" />
            <Line type="monotone" dataKey="collab" stroke="#10b981" strokeWidth={2} name="Team Collaboration" />
            <Line type="monotone" dataKey="integration" stroke="#f59e0b" strokeWidth={2} name="Integration Setup" />
            <Line type="monotone" dataKey="check" stroke="#8b5cf6" strokeWidth={2} name="Weekly Check-in" />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Pattern Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Patterns */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
          <div className="border-b border-gray-200 dark:border-[#2B2B30] px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Conversion Patterns</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Pattern</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Impact</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Using</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
                {conversionPatterns.map((pattern) => (
                  <tr key={pattern.pattern} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium text-gray-900 dark:text-white">{pattern.pattern}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{pattern.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400 font-medium">+{pattern.impact}%</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">{pattern.accounts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Retention Patterns */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
          <div className="border-b border-gray-200 dark:border-[#2B2B30] px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Retention Patterns</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Pattern</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Impact</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Using</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
                {retentionPatterns.map((pattern) => (
                  <tr key={pattern.pattern} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium text-gray-900 dark:text-white">{pattern.pattern}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{pattern.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400 font-medium">+{pattern.impact}%</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">{pattern.accounts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Upsell Patterns */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="border-b border-gray-200 dark:border-[#2B2B30] px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upsell Patterns</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Pattern</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Description</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Impact</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Using</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
              {upsellPatterns.map((pattern) => (
                <tr key={pattern.pattern} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{pattern.pattern}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{pattern.description}</td>
                  <td className="px-6 py-4 text-sm text-right text-green-600 dark:text-green-400 font-medium">+{pattern.impact}%</td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600 dark:text-gray-400">{pattern.accounts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommended Actions */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="border-b border-gray-200 dark:border-[#2B2B30] px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recommended Actions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Pattern</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Impact</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
              {recommendedActions.map((rec) => (
                <tr key={rec.pattern} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{rec.pattern}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      rec.status === "Implemented" ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300" :
                      rec.status === "Partially implemented" ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300" :
                      "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}>
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{rec.impact}</td>
                  <td className="px-6 py-4 text-sm">
                    <button className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      rec.action === "Implement" ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900" :
                      rec.action === "Complete" ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900" :
                      "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900"
                    }`}>
                      {rec.action}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
