"use client"

import { ChartContainer } from "@/components/admin/chart-container"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

// Mock revenue data
const mrrTrendData = [
  { month: "Jan", total: 42000, expansion: 2000, churn: -1500 },
  { month: "Feb", total: 44500, expansion: 2800, churn: -2000 },
  { month: "Mar", total: 48200, expansion: 3200, churn: -1800 },
  { month: "Apr", total: 51000, expansion: 3500, churn: -1600 },
  { month: "May", total: 54300, expansion: 3800, churn: -2100 },
  { month: "Jun", total: 58200, expansion: 4200, churn: -1900 },
  { month: "Jul", total: 61500, expansion: 4500, churn: -2300 },
  { month: "Aug", total: 65200, expansion: 4800, churn: -2600 },
  { month: "Sep", total: 68500, expansion: 5100, churn: -2200 },
  { month: "Oct", total: 71200, expansion: 5400, churn: -2400 },
  { month: "Nov", total: 74800, expansion: 5700, churn: -2200 },
  { month: "Dec", total: 78500, expansion: 6100, churn: -2800 },
]

const planPerformance = [
  { plan: "Free", accounts: 340, mrrPct: 0, avgUsage: 0.8 },
  { plan: "Pro", accounts: 890, mrrPct: 35, avgUsage: 6.5 },
  { plan: "Enterprise", accounts: 410, mrrPct: 65, avgUsage: 8.9 },
]

const cohortRetention = [
  { cohort: "Jan 24", w0: 100, w4: 92, w12: 84, w24: 78, w52: 72 },
  { cohort: "Feb 24", w0: 100, w4: 93, w12: 86, w24: 80, w52: null },
  { cohort: "Mar 24", w0: 100, w4: 94, w12: 88, w24: null, w52: null },
  { cohort: "Apr 24", w0: 100, w4: 95, w12: null, w24: null, w52: null },
  { cohort: "May 24", w0: 100, w4: 96, w12: null, w24: null, w52: null },
  { cohort: "Jun 24", w0: 100, w4: null, w12: null, w24: null, w52: null },
]

const churnReasons = [
  { reason: "Too expensive", count: 12, pct: 32 },
  { reason: "Found alternative", count: 8, pct: 21 },
  { reason: "Low usage", count: 7, pct: 18 },
  { reason: "Features not needed", count: 6, pct: 16 },
  { reason: "Poor support", count: 4, pct: 11 },
  { reason: "Other", count: 1, pct: 2 },
]

const churnedAccounts = [
  { id: 1, account: "TechStart Labs", plan: "Pro", mrr: 2400, churnDate: "2 days ago", reason: "Too expensive" },
  { id: 2, account: "DataFlow Inc", plan: "Pro", mrr: 1800, churnDate: "5 days ago", reason: "Low usage" },
  { id: 3, account: "CloudVenture", plan: "Enterprise", mrr: 5200, churnDate: "1 week ago", reason: "Found alternative" },
  { id: 4, account: "RetailHub", plan: "Pro", mrr: 1500, churnDate: "10 days ago", reason: "Features not needed" },
  { id: 5, account: "FinanceTools", plan: "Enterprise", mrr: 3800, churnDate: "2 weeks ago", reason: "Poor support" },
]

export default function RevenuePage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Revenue & Retention</h1>
        <p className="text-gray-600 dark:text-gray-400">Monitor MRR, retention, cohorts, and churn metrics</p>
      </div>

      {/* Revenue Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Current MRR</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">$78,500</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">↑ 8.5% from last month</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Current ARR</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">$942,000</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">↑ 12.4% YoY growth</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Net Retention</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">127%</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">Strong expansion</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Monthly Churn</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">2.4%</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">↑ 0.3% vs last month</p>
        </div>
      </div>

      {/* MRR Trend */}
      <ChartContainer title="MRR Trend with Expansion/Churn" description="12-month MRR trajectory showing expansion and churn impact">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={mrrTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip contentStyle={{ backgroundColor: "#0f0f12", border: "1px solid #1f1f23", borderRadius: "8px" }} />
            <Legend />
            <Area type="monotone" dataKey="expansion" stackId="1" stroke="#10b981" fill="#10b981" name="Expansion" opacity={0.7} />
            <Area type="monotone" dataKey="churn" stackId="1" stroke="#ef4444" fill="#ef4444" name="Churn" opacity={0.7} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Plan Performance & Cohort Retention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Performance Table */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Plan Performance</h2>
          <div className="space-y-4">
            {planPerformance.map((plan) => (
              <div key={plan.plan} className="border-b border-gray-200 dark:border-[#2B2B30] pb-4 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900 dark:text-white">{plan.plan}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{plan.accounts} accounts</span>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">% of MRR</div>
                    <div className="w-full bg-gray-200 dark:bg-[#2B2B30] rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${plan.mrrPct || 5}%` }}></div>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white w-12">{plan.mrrPct || "<1"}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cohort Retention */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6 overflow-x-auto">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cohort Retention %</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#2B2B30]">
                <th className="text-left px-2 py-2 font-medium text-gray-700 dark:text-gray-300">Cohort</th>
                <th className="text-center px-2 py-2 font-medium text-gray-700 dark:text-gray-300">W0</th>
                <th className="text-center px-2 py-2 font-medium text-gray-700 dark:text-gray-300">W4</th>
                <th className="text-center px-2 py-2 font-medium text-gray-700 dark:text-gray-300">W12</th>
                <th className="text-center px-2 py-2 font-medium text-gray-700 dark:text-gray-300">W24</th>
                <th className="text-center px-2 py-2 font-medium text-gray-700 dark:text-gray-300">W52</th>
              </tr>
            </thead>
            <tbody>
              {cohortRetention.map((row) => (
                <tr key={row.cohort} className="border-b border-gray-200 dark:border-[#2B2B30] last:border-0">
                  <td className="px-2 py-2 text-gray-900 dark:text-white">{row.cohort}</td>
                  {[row.w0, row.w4, row.w12, row.w24, row.w52].map((val, idx) => (
                    <td key={idx} className={`text-center px-2 py-2 ${
                      val === null ? "text-gray-400" :
                      val >= 90 ? "text-green-600 dark:text-green-400 font-medium" :
                      val >= 80 ? "text-blue-600 dark:text-blue-400 font-medium" :
                      "text-yellow-600 dark:text-yellow-400 font-medium"
                    }`}>
                      {val !== null ? `${val}%` : "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Churn Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Churn Reasons */}
        <ChartContainer title="Churn Reasons Analysis" description="Primary reasons for account cancellations">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={churnReasons}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="reason" angle={-45} textAnchor="end" height={80} stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip contentStyle={{ backgroundColor: "#0f0f12", border: "1px solid #1f1f23", borderRadius: "8px" }} />
              <Bar dataKey="count" fill="#ef4444" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Churned Accounts */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recently Churned</h2>
          <div className="space-y-3">
            {churnedAccounts.map((account) => (
              <div key={account.id} className="p-3 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30]">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium text-gray-900 dark:text-white">{account.account}</h3>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{account.churnDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="inline-block bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded text-xs font-medium mr-2">
                      {account.plan}
                    </span>
                    ${account.mrr.toLocaleString()}/mo
                  </div>
                  <span className="text-xs text-red-600 dark:text-red-400">{account.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
