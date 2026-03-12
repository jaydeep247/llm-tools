"use client"

import { FileText, Download, Clock } from "lucide-react"

// Mock reports data
const reportTemplates = [
  {
    id: 1,
    name: "Executive Summary",
    description: "High-level overview of business metrics",
    frequency: "Monthly",
    format: ["PDF"],
    lastGenerated: "2024-02-15",
  },
  {
    id: 2,
    name: "Product Insights",
    description: "Feature adoption and usage analytics",
    frequency: "Weekly",
    format: ["PDF", "CSV"],
    lastGenerated: "2024-02-19",
  },
  {
    id: 3,
    name: "Revenue Deep Dive",
    description: "Detailed revenue, retention, and churn analysis",
    frequency: "Monthly",
    format: ["PDF", "CSV"],
    lastGenerated: "2024-02-15",
  },
  {
    id: 4,
    name: "Customer Health Scorecard",
    description: "Individual customer status and risk assessment",
    frequency: "Weekly",
    format: ["CSV"],
    lastGenerated: "2024-02-19",
  },
  {
    id: 5,
    name: "Support Analytics",
    description: "Ticket volume, sentiment, and resolution metrics",
    frequency: "Weekly",
    format: ["PDF"],
    lastGenerated: "2024-02-18",
  },
]

const reportHistory = [
  {
    id: 1,
    name: "Product Insights",
    date: "2024-02-19 10:30 AM",
    format: "PDF",
    size: "2.4 MB",
    period: "Feb 1-19, 2024",
  },
  {
    id: 2,
    name: "Executive Summary",
    date: "2024-02-15 09:00 AM",
    format: "PDF",
    size: "1.8 MB",
    period: "Jan 1 - Feb 15, 2024",
  },
  {
    id: 3,
    name: "Customer Health Scorecard",
    date: "2024-02-12 11:45 AM",
    format: "CSV",
    size: "845 KB",
    period: "Feb 1-12, 2024",
  },
  {
    id: 4,
    name: "Support Analytics",
    date: "2024-02-11 08:00 AM",
    format: "PDF",
    size: "1.2 MB",
    period: "Feb 1-11, 2024",
  },
]

export default function ReportsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Reports & Exports</h1>
        <p className="text-gray-600 dark:text-gray-400">Generate and manage pre-built reports and custom exports</p>
      </div>

      {/* Pre-built Report Templates */}
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Pre-built Reports</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">Generate reports from established templates</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reportTemplates.map((template) => (
            <div key={template.id} className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-4">
                <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400 shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{template.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{template.description}</p>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {template.format.map((fmt) => (
                      <span key={fmt} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-[#1F1F23] text-gray-700 dark:text-gray-300">
                        {fmt}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-4">
                    <span>Updated: {template.lastGenerated}</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{template.frequency}</span>
                  </div>
                  <button className="w-full px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-800 text-sm font-medium transition-colors">
                    Generate Report
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Export Builder */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Custom CSV Export</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Create custom data exports with your selected fields</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data Source</label>
            <select className="w-full px-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white focus:outline-none focus:border-blue-500">
              <option>Accounts & Users</option>
              <option>Revenue & MRR</option>
              <option>Feature Usage</option>
              <option>Support Tickets</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="px-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white" />
              <input type="date" className="px-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white" />
            </div>
          </div>

          <div className="flex gap-3">
            <button className="px-6 py-2 rounded-lg bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-800 font-medium transition-colors">
              Generate Export
            </button>
            <button className="px-6 py-2 rounded-lg bg-gray-100 dark:bg-[#1F1F23] text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-[#2B2B30] font-medium transition-colors">
              Schedule
            </button>
          </div>
        </div>
      </div>

      {/* Report History */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="border-b border-gray-200 dark:border-[#2B2B30] px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Reports</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Report</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Generated</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Format</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Size</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Period</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
              {reportHistory.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{report.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <Clock className="h-4 w-4" />
                      {report.date}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      {report.format}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{report.size}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{report.period}</td>
                  <td className="px-6 py-4 text-sm">
                    <button className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      <Download className="h-4 w-4" />
                      Download
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
