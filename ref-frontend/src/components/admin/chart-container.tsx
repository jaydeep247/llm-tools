import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReactNode } from "react"

interface ChartContainerProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function ChartContainer({
  title,
  description,
  children,
  className = "",
}: ChartContainerProps) {
  return (
    <Card className={`bg-white dark:bg-[#0F0F12] border-gray-200 dark:border-[#1F1F23] ${className}`}>
      <CardHeader>
        <CardTitle className="text-lg text-gray-900 dark:text-white">{title}</CardTitle>
        {description && (
          <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="text-gray-900 dark:text-white">
        {children}
      </CardContent>
    </Card>
  )
}
