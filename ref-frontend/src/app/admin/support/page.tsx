"use client"

import { ChartContainer } from "@/components/admin/chart-container"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

// Mock data
const ticketsByFeature = [
  { feature: "Advanced Search", tickets: 45 },
  { feature: "API Integration", tickets: 38 },
  { feature: "Real-time Collaboration", tickets: 32 },
  { feature: "Custom Workflows", tickets: 28 },
  { feature: "Scheduled Reports", tickets: 22 },
  { feature: "Team Management", tickets: 19 },
]

const sentimentData = [
  { name: "Positive", value: 42 },
  { name: "Neutral", value: 38 },
  { name: "Negative", value: 20 },
]

const unresolved = [
  { id: 1, title: "Search results not updating in real-time", feature: "Advanced Search", priority: "High", age: "2 days" },
  { id: 2, title: "API rate limits too restrictive", feature: "API Integration", priority: "High", age: "1 day" },
  { id: 3, title: "Collaboration sync issues", feature: "Real-time Collaboration", priority: "Medium", age: "3 days" },
  { id: 4, title: "Workflow timeout errors", feature: "Custom Workflows", priority: "High", age: "4 hours" },
  { id: 5, title: "Report export formatting issues", feature: "Scheduled Reports", priority: "Medium", age: "2 days" },
]

const roadmapRequests = [
  { text: "Bulk user management", count: 12 },
  { text: "Advanced scheduling", count: 10 },
  { text: "Webhook integrations", count: 8 },
  { text: "SAML support", count: 7 },
  { text: "Custom dashboards", count: 6 },
  { text: "AI-powered recommendations", count: 9 },
  { text: "Dark mode improvements", count: 5 },
]

const COLORS = ["#10b981", "#6b7280", "#ef4444"]

export default function SupportPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Support & Feedback</h1>
        <p className="text-gray-600 dark:text-gray-400">Monitor customer issues and feature requests</p>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Open Tickets</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">184</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">↑ 12 this week</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Avg Response Time</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">3.2h</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">↓ 0.5h vs last week</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Satisfaction Rate</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">4.6/5</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">↑ 0.2 vs last month</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Feature Requests</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">67</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Open requests</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartContainer title="Tickets by Feature" description="Most-mentioned features in support tickets">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ticketsByFeature}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="feature" angle={-45} textAnchor="end" height={80} stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip contentStyle={{ backgroundColor: "#0f0f12", border: "1px solid #1f1f23", borderRadius: "8px" }} />
              <Bar dataKey="tickets" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Sentiment Distribution" description="Customer sentiment in feedback">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={sentimentData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {sentimentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Unresolved Issues */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Unresolved Issues (Priority)</h2>
        <div className="space-y-3">
          {unresolved.map((issue) => (
            <div key={issue.id} className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30]">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-gray-900 dark:text-white">{issue.title}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    issue.priority === "High" ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300" :
                    "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300"
                  }`}>
                    {issue.priority}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-gray-600 dark:text-gray-400">
                  <span>Feature: {issue.feature}</span>
                  <span>Opened: {issue.age} ago</span>
                </div>
              </div>
              <button className="px-3 py-1.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900">
                Resolve
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Requests Word Cloud */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Feature Requests</h2>
        <div className="flex flex-wrap gap-3">
          {roadmapRequests.map((req) => (
            <button
              key={req.text}
              className="px-4 py-2 rounded-lg bg-linear-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 text-gray-900 dark:text-white border border-blue-200 dark:border-purple-800 hover:shadow-md transition-shadow"
              title={`${req.count} requests`}
            >
              {req.text}
              <span className="ml-2 text-xs font-semibold text-blue-600 dark:text-blue-300">{req.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
