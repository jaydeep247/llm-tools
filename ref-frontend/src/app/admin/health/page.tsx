"use client"

import { ChartContainer } from "@/components/admin/chart-container"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { CheckCircle, Clock } from "lucide-react"

// Mock data
const errorTrendData = [
  { date: "Dec 1", errors: 245, resolved: 180 },
  { date: "Dec 5", errors: 198, resolved: 145 },
  { date: "Dec 10", errors: 312, resolved: 220 },
  { date: "Dec 15", errors: 187, resolved: 165 },
  { date: "Dec 20", errors: 156, resolved: 140 },
  { date: "Dec 25", errors: 98, resolved: 95 },
  { date: "Dec 31", errors: 73, resolved: 71 },
]

const services = [
  { id: "crawler", name: "Web Crawler", status: "live", uptime: "99.8%" },
  { id: "ai-engine", name: "AI Processing Engine", status: "live", uptime: "99.95%" },
  { id: "database", name: "Database", status: "live", uptime: "99.99%" },
  { id: "cache", name: "Cache Layer", status: "live", uptime: "99.5%" },
  { id: "queue", name: "Job Queue", status: "live", uptime: "98.9%" },
]

const errors = [
  { id: 1, type: "Timeout on AI inference", count: 1240, accounts: 45, severity: "high", lastSeen: "10 mins ago", version: "2.4.1" },
  { id: 2, type: "Database connection pool exhausted", count: 89, accounts: 3, severity: "critical", lastSeen: "2 hours ago", version: "2.4.0" },
  { id: 3, type: "Cache miss rate spike", count: 340, accounts: 12, severity: "medium", lastSeen: "5 mins ago", version: "2.4.1" },
  { id: 4, type: "Failed webhook delivery", count: 23, accounts: 5, severity: "low", lastSeen: "30 mins ago", version: "2.4.1" },
  { id: 5, type: "Memory leak in worker", count: 5, accounts: 1, severity: "high", lastSeen: "1 day ago", version: "2.3.8" },
]

const activeJobs = [
  { id: 1, name: "Bulk account export", progress: 65, elapsed: "2h 15m", eta: "50m" },
  { id: 2, name: "Weekly retention report", progress: 45, elapsed: "1h 30m", eta: "1h 10m" },
  { id: 3, name: "Daily crawl job", progress: 82, elapsed: "3h 45m", eta: "45m" },
  { id: 4, name: "ML model retraining", progress: 23, elapsed: "4h 20m", eta: "12h 15m" },
]

const crawlMetrics = {
  pagesCrawled: 2450000,
  successRate: 94.2,
  errors: 143000,
  avgParseTime: 285,
}

export default function HealthPage() {
  const getSeverityColor = (severity: string) => {
    if (severity === "critical") return "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
    if (severity === "high") return "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300"
    if (severity === "medium") return "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300"
    return "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">System Health</h1>
        <p className="text-gray-600 dark:text-gray-400">Monitor services, errors, and system performance</p>
      </div>

      {/* Global Health Status */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Global Health Status</h2>
        <div className="flex flex-wrap gap-4">
          {services.map((service) => (
            <div key={service.id} className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-100">{service.name}</p>
                <p className="text-xs text-green-700 dark:text-green-300">Uptime: {service.uptime}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">Last checked: 2 minutes ago</p>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Avg Response Time</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">245ms</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">↓ 15ms from last week</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Error Rate</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">0.34%</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">↑ 0.04% vs last week</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">P95 Latency</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">892ms</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">API p95 response</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Uptime SLA</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">99.94%</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">This month</p>
        </div>
      </div>

      {/* Error Trend */}
      <ChartContainer title="Error Trend" description="System errors and resolutions over time">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={errorTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip contentStyle={{ backgroundColor: "#0f0f12", border: "1px solid #1f1f23", borderRadius: "8px" }} />
            <Legend />
            <Line type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={2} name="New Errors" />
            <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} name="Resolved" />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Error Explorer */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="border-b border-gray-200 dark:border-[#2B2B30] px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Error Explorer</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Error Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Frequency</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Accounts</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Last Seen</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Version</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
              {errors.map((error) => (
                <tr key={error.id} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{error.type}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{error.count.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{error.accounts}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {error.lastSeen}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-600 dark:text-gray-400">{error.version}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(error.severity)}`}>
                      {error.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Job Monitor & Crawl Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Monitor */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Background Jobs</h2>
          <div className="space-y-4">
            {activeJobs.map((job) => (
              <div key={job.id} className="border-b border-gray-200 dark:border-[#2B2B30] pb-4 last:border-0">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium text-gray-900 dark:text-white">{job.name}</h3>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{job.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-[#2B2B30] rounded-full h-2 mb-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${job.progress}%` }}></div>
                </div>
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>Elapsed: {job.elapsed}</span>
                  <span>ETA: {job.eta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Crawl Health */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Crawl Health</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">Pages Crawled</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{(crawlMetrics.pagesCrawled / 1000000).toFixed(1)}M</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Success Rate</span>
                <span className="text-sm font-medium text-green-600 dark:text-green-400">{crawlMetrics.successRate}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-[#2B2B30] rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: `${crawlMetrics.successRate}%` }}></div>
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Errors</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{(crawlMetrics.errors / 1000).toFixed(0)}k</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Avg Parse Time</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{crawlMetrics.avgParseTime}ms</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
