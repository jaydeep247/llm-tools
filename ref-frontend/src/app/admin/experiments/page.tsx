"use client"

// Mock experiments data
const experiments = [
  { id: 1, name: "New Search Algorithm", type: "A/B Test", status: "Running", rollout: 45, impact: 12.3, accounts: 560 },
  { id: 2, name: "Simplified UI Navigation", type: "A/B Test", status: "Complete", rollout: 100, impact: 8.7, accounts: 1240 },
  { id: 3, name: "AI Recommendations v2", type: "Feature Flag", status: "Running", rollout: 25, impact: 5.2, accounts: 310 },
  { id: 4, name: "Dark Mode Default", type: "Feature Flag", status: "Complete", rollout: 100, impact: 3.1, accounts: 890 },
  { id: 5, name: "Bulk Import Beta", type: "Beta Cohort", status: "Running", rollout: 15, impact: 9.8, accounts: 185 },
]

const featureFlags = [
  { name: "new_search_ui", status: "Active", rollout: 45, targeting: "Gradual rollout" },
  { name: "ai_recommendations_v2", status: "Active", rollout: 25, targeting: "Enterprise only" },
  { name: "dark_mode_default", status: "Active", rollout: 100, targeting: "All users" },
  { name: "advanced_exports", status: "Inactive", rollout: 0, targeting: "Beta testers" },
  { name: "scheduled_workflows", status: "Active", rollout: 60, targeting: "Pro+ accounts" },
]

export default function ExperimentsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Experiments & Rollouts</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage A/B tests, feature flags, and beta cohorts</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Active Tests</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">3</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Currently running</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Completed</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">2</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">Rolled out fully</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Avg Lift</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">+7.8%</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Across all tests</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">In Beta</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">185</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Beta accounts</p>
        </div>
      </div>

      {/* Experiments */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="border-b border-gray-200 dark:border-[#2B2B30] px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Experiments & Tests</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Experiment</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Rollout %</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Impact</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Accounts</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
              {experiments.map((exp) => (
                <tr key={exp.id} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{exp.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{exp.type}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      exp.status === "Running" ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300" :
                      "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300"
                    }`}>
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="w-16 bg-gray-200 dark:bg-[#2B2B30] rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${exp.rollout}%` }}></div>
                    </div>
                    <span className="text-xs text-gray-600 dark:text-gray-400 mt-1">{exp.rollout}%</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-green-600 dark:text-green-400 font-medium">+{exp.impact}%</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{exp.accounts.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm">
                    <button className="text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature Flags */}
      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="border-b border-gray-200 dark:border-[#2B2B30] px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Feature Flags</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#1F1F23] border-b border-gray-200 dark:border-[#2B2B30]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Flag Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Rollout</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Targeting</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2B2B30]">
              {featureFlags.map((flag) => (
                <tr key={flag.name} className="hover:bg-gray-50 dark:hover:bg-[#1F1F23] transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-white">{flag.name}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      flag.status === "Active" ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300" :
                      "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}>
                      {flag.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="w-20 bg-gray-200 dark:bg-[#2B2B30] rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: `${flag.rollout}%` }}></div>
                    </div>
                    <span className="text-xs text-gray-600 dark:text-gray-400 mt-1">{flag.rollout}%</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{flag.targeting}</td>
                  <td className="px-6 py-4 text-sm">
                    <button className="text-blue-600 dark:text-blue-400 hover:underline">Configure</button>
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
