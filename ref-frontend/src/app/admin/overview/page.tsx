import Link from "next/link"
import { Users, DollarSign, Activity, Zap, TrendingUp, AlertCircle } from "lucide-react"

const StatBox = ({ icon: Icon, label, value, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; href: string }) => (
  <Link href={href}>
    <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{value}</p>
        </div>
        <Icon className="h-6 w-6 text-blue-500" />
      </div>
    </div>
  </Link>
)

export default function OverviewPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Track your business metrics and system health at a glance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatBox icon={Users} label="Active Accounts" value="1,240" href="/admin/accounts" />
        <StatBox icon={DollarSign} label="Total MRR" value="$78,500" href="/admin/revenue" />
        <StatBox icon={Activity} label="DAU/WAU" value="8,420 / 14,230" href="/admin/accounts" />
        <StatBox icon={Zap} label="Feature Adoption" value="72%" href="/admin/features" />
        <StatBox icon={TrendingUp} label="AI Actions" value="2.4M" href="/admin/intelligence" />
        <StatBox icon={AlertCircle} label="System Health" value="99.2%" href="/admin/health" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Churn Rate</h3>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">2.4%</div>
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">↑ 0.3% vs last month</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">NPS Score</h3>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">64</div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">↑ 2 vs last quarter</p>
        </div>

        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">ARR</h3>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">$942,000</div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">↑ 8.5% growth</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/admin/accounts">
          <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Accounts & Users</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Browse and manage customer accounts</p>
            <div className="mt-4 text-sm text-blue-600 dark:text-blue-400">View Details →</div>
          </div>
        </Link>

        <Link href="/admin/features">
          <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Features</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Track feature adoption and performance</p>
            <div className="mt-4 text-sm text-blue-600 dark:text-blue-400">View Details →</div>
          </div>
        </Link>

        <Link href="/admin/intelligence">
          <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">LLM Quality Lab</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Monitor AI model quality and performance</p>
            <div className="mt-4 text-sm text-blue-600 dark:text-blue-400">View Details →</div>
          </div>
        </Link>

        <Link href="/admin/health">
          <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">System Health</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">View system status and error tracking</p>
            <div className="mt-4 text-sm text-blue-600 dark:text-blue-400">View Details →</div>
          </div>
        </Link>
      </div>
    </div>
  )
}
