import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown } from "lucide-react"
import { ReactNode } from "react"

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string | number
  trend?: number
  trendLabel?: string
  status?: "positive" | "negative" | "neutral"
}

export function StatCard({
  icon,
  label,
  value,
  trend,
  trendLabel = "vs last period",
  status = "neutral",
}: StatCardProps) {
  const trendColor =
    status === "positive"
      ? "text-green-600 dark:text-green-400"
      : status === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-gray-600 dark:text-gray-400"

  const trendBgColor =
    status === "positive"
      ? "bg-green-50 dark:bg-green-950"
      : status === "negative"
        ? "bg-red-50 dark:bg-red-950"
        : "bg-gray-50 dark:bg-gray-900"

  return (
    <Card className="bg-white dark:bg-[#0F0F12] border-gray-200 dark:border-[#1F1F23]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</CardTitle>
        <div className="text-blue-600 dark:text-blue-400">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-sm ${trendColor} ${trendBgColor} px-2 py-1 rounded w-fit`}>
              {trend >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>{Math.abs(trend)}%</span>
              <span className="text-xs opacity-75">{trendLabel}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
