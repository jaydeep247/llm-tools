'use client'

import { useGetModuleFTrendsQuery } from '@/store/api/module_F/moduleFApi'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, LineChart as LineChartIcon, Activity, Calendar } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

interface CompetitorGrowthTrendsProps {
  jobId: string
}

export default function CompetitorGrowthTrends({ jobId }: CompetitorGrowthTrendsProps) {
  const { data: response, isLoading, error } = useGetModuleFTrendsQuery(jobId, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const trends = response?.data
  const history = trends?.history || []
  const growthRates = trends?.growth_rates

  const chartData = useMemo(() => {
    if (!history.length) return []
    return history.map(point => {
      const dateStr = point.date ? format(new Date(point.date), 'MMM dd') : ''
      const item: any = {
        date: dateStr,
        fullDate: point.date,
        [point.brand.name]: point.brand.visibility_score,
        [`${point.brand.name}_share`]: point.brand.market_share_percent,
      }
      point.competitors.forEach(comp => {
        item[comp.name] = comp.visibility_score
        item[`${comp.name}_share`] = comp.market_share_percent
      })
      return item
    })
  }, [history])

  const lines = useMemo(() => {
    if (!history.length) return []
    const firstPoint = history[0]
    const lines = [
      { dataKey: firstPoint.brand.name, color: '#3b82f6', name: firstPoint.brand.name }
    ]
    firstPoint.competitors.forEach((comp, index) => {
      // Generate distinct colors
      const colors = ['#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
      lines.push({
        dataKey: comp.name,
        color: colors[index % colors.length],
        name: comp.name
      })
    })
    return lines
  }, [history])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-[300px] w-full rounded-xl" />
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    )
  }

  if (error || !trends || !history.length) {
    return (
      <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <LineChartIcon className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
          <h3 className="text-lg font-medium text-foreground mb-2">No Trend Data Available</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Run the analysis multiple times to start tracking growth trends over time.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Visibility Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-foreground">
                {growthRates?.brand_visibility.toFixed(1)}%
              </span>
              {growthRates?.brand_visibility !== undefined && (
                growthRates.brand_visibility >= 0 ? 
                  <TrendingUp className="h-4 w-4 text-emerald-500" /> : 
                  <TrendingDown className="h-4 w-4 text-rose-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">vs previous run</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Market Share Change</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-foreground">
                {growthRates?.brand_market_share && growthRates.brand_market_share > 0 ? '+' : ''}
                {growthRates?.brand_market_share.toFixed(1)}%
              </span>
              {growthRates?.brand_market_share !== undefined && (
                growthRates.brand_market_share >= 0 ? 
                  <TrendingUp className="h-4 w-4 text-emerald-500" /> : 
                  <TrendingDown className="h-4 w-4 text-rose-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">vs previous run</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Data Points</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-foreground">{history.length}</span>
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Historical runs tracked</p>
          </CardContent>
        </Card>
      </div>

      {/* Visibility Score Trend Chart */}
      <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LineChartIcon className="h-5 w-5 text-blue-400" />
            <CardTitle>Visibility Score Trend</CardTitle>
          </div>
          <CardDescription>
            Historical performance of visibility scores (0-100)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend />
                {lines.map(line => (
                  <Line
                    key={line.dataKey}
                    type="monotone"
                    dataKey={line.dataKey}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={2}
                    dot={{ r: 4, fill: line.color }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Market Share Trend Chart */}
      <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-400" />
            <CardTitle>Market Share Trend</CardTitle>
          </div>
          <CardDescription>
            Percentage of AI outputs mentioning the brand vs competitors
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  domain={[0, 100]}
                  unit="%"
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend />
                {lines.map(line => (
                  <Line
                    key={`${line.dataKey}_share`}
                    type="monotone"
                    dataKey={`${line.dataKey}_share`}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 4, fill: line.color }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}