"use client"

import { ChartContainer } from "@/components/admin/chart-container"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

// Mock data
const modelPerformance = [
  { model: "GPT-4 Turbo", accuracy: 94, latency: 245, cost: 0.03 },
  { model: "Claude 3 Opus", accuracy: 92, latency: 312, cost: 0.075 },
  { model: "Llama 2 70B", accuracy: 87, latency: 156, cost: 0.008 },
  { model: "Mistral 7B", accuracy: 84, latency: 89, cost: 0.001 },
]

const citationMetrics = [
  { metric: "Citation Rate", value: 87, target: 95 },
  { metric: "Accuracy of Citations", value: 94, target: 98 },
  { metric: "Source Relevance", value: 91, target: 95 },
  { metric: "Coverage Completeness", value: 88, target: 90 },
]

const entityExtractionData = [
  { entity: "Person", precision: 96, recall: 93 },
  { entity: "Organization", precision: 94, recall: 89 },
  { entity: "Location", precision: 97, recall: 95 },
  { entity: "Product", precision: 88, recall: 82 },
  { entity: "Event", precision: 85, recall: 78 },
]

const schemaUsageData = [
  { schema: "Company", usage: 45 },
  { schema: "Person", usage: 38 },
  { schema: "Product", usage: 32 },
  { schema: "Location", usage: 28 },
  { schema: "Event", usage: 15 },
]

const latencyData = [
  { time: "12am", p50: 145, p95: 450, p99: 890 },
  { time: "6am", p50: 156, p95: 480, p99: 950 },
  { time: "12pm", p50: 245, p95: 650, p99: 1200 },
  { time: "6pm", p50: 312, p95: 850, p99: 1450 },
  { time: "11pm", p50: 267, p95: 720, p99: 1300 },
]

const qualityIssues = [
  { issue: "Hallucinated citations", count: 23, severity: "high" },
  { issue: "Missing relevant entities", count: 45, severity: "medium" },
  { issue: "Schema mapping errors", count: 12, severity: "medium" },
  { issue: "Incorrect entity classification", count: 34, severity: "low" },
  { issue: "Incomplete schema coverage", count: 56, severity: "medium" },
]

export default function IntelligencePage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">LLM Quality Lab</h1>
        <p className="text-gray-600 dark:text-gray-400">Monitor AI model performance, quality metrics, and execution data</p>
      </div>

      {/* Model Performance Overview */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="border-b border-gray-200 dark:border-[#2B2B30] px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Model Performance Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Model</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Accuracy</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Latency (ms)</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Cost per 1k tokens</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
              {modelPerformance.map((model) => (
                <tr key={model.model} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{model.model}</td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 dark:bg-[#2B2B30] rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${model.accuracy}%` }}></div>
                      </div>
                      <span className="text-gray-900 dark:text-white font-medium">{model.accuracy}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{model.latency}ms</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">${model.cost}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      model.accuracy >= 92 ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300" :
                      model.accuracy >= 87 ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300" :
                      "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300"
                    }`}>
                      High
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Citation & Quality Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Citation Performance */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Citation Performance</h2>
          <div className="space-y-4">
            {citationMetrics.map((metric) => (
              <div key={metric.metric}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{metric.metric}</span>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="text-gray-900 dark:text-white font-medium">{metric.value}%</span>
                    <span className="text-xs text-gray-500 dark:text-gray-500 ml-2">target: {metric.target}%</span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 dark:bg-[#2B2B30] rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${metric.value}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Schema Usage */}
        <ChartContainer title="Schema Usage Distribution" description="Top schemas being extracted">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={schemaUsageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="schema" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip contentStyle={{ backgroundColor: "#0f0f12", border: "1px solid #1f1f23", borderRadius: "8px" }} />
              <Bar dataKey="usage" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Entity Extraction & Latency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entity Extraction */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Entity Extraction Accuracy</h2>
          <div className="space-y-3">
            {entityExtractionData.map((entity) => (
              <div key={entity.entity} className="border-b border-gray-200 dark:border-[#2B2B30] pb-3 last:border-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{entity.entity}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Precision</p>
                    <div className="w-full bg-gray-200 dark:bg-[#2B2B30] rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: `${entity.precision}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-900 dark:text-white mt-1">{entity.precision}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Recall</p>
                    <div className="w-full bg-gray-200 dark:bg-[#2B2B30] rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${entity.recall}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-900 dark:text-white mt-1">{entity.recall}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Latency Percentiles */}
        <ChartContainer title="Latency Percentiles" description="Response time distribution by hour">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={latencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip contentStyle={{ backgroundColor: "#0f0f12", border: "1px solid #1f1f23", borderRadius: "8px" }} />
              <Legend />
              <Line type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2} name="P50" />
              <Line type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={2} name="P95" />
              <Line type="monotone" dataKey="p99" stroke="#ef4444" strokeWidth={2} name="P99" />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Quality Issues */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quality Issues Detected</h2>
        <div className="space-y-2">
          {qualityIssues.map((issue) => (
            <div key={issue.issue} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-[#1F1F23]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{issue.issue}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  issue.severity === "high" ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300" :
                  issue.severity === "medium" ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300" :
                  "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                }`}>
                  {issue.severity}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white w-8 text-right">{issue.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
