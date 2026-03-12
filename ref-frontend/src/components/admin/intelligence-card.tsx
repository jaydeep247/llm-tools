import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface IntelligenceCardProps {
  title: string
  domain: string
  citationCount: number
  liftPercentage: number
  model: string
  trend?: number
}

export function IntelligenceCard({
  title,
  domain,
  citationCount,
  liftPercentage,
  model,
  trend,
}: IntelligenceCardProps) {
  return (
    <Card className="bg-linear-to-br from-blue-50 to-blue-50 dark:from-blue-950/20 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base text-gray-900 dark:text-white line-clamp-2">{title}</CardTitle>
            <CardDescription className="text-sm text-gray-600 dark:text-gray-400 mt-1">{domain}</CardDescription>
          </div>
          <Badge variant="secondary" className="ml-2 bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100">
            {model}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Citations</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{citationCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Citation Lift</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">+{liftPercentage}%</span>
              {trend !== undefined && (
                <span className={`text-xs font-medium ${trend >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
