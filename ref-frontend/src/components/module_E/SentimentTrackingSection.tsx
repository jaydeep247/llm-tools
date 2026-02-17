'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Eye, Brain, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SentimentTrackingProps {
  sentimentData?: {
    brand_name?: string
    industry?: string
    service_type?: string
    sentiment?: {
      overall_score?: number
      distribution?: { Positive?: number; Neutral?: number; Negative?: number }
      by_model?: Record<string, { score?: number; distribution?: any }>
    }
    visibility?: {
      overall_visibility_score?: number
      overall_appearance_rate?: number
      by_model?: Record<string, { 
        visibility_score?: number
        appearance_rate?: number
        appearances?: number
        total_prompts?: number
      }>
    }
    timestamp?: string
  }
}

export default function SentimentTrackingSection({ sentimentData }: SentimentTrackingProps) {
  if (!sentimentData) {
    return (
      <Card className="rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Sentiment & Visibility Tracking</h3>
            <p className="text-xs text-muted-foreground">
              No sentiment tracking data yet. Run Module E analysis to generate AI perception insights.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  const sentiment = sentimentData.sentiment ?? {
    overall_score: 0,
    distribution: { Positive: 0, Neutral: 0, Negative: 0 },
    by_model: {},
  }
  const visibility = sentimentData.visibility ?? {
    overall_visibility_score: 0,
    overall_appearance_rate: 0,
    by_model: {},
  }
  const brand_name = sentimentData.brand_name ?? 'Unknown'
  const industry = sentimentData.industry ?? 'Unknown'
  const service_type = sentimentData.service_type ?? 'Unknown'
  
  // Color coding for sentiment scores
  const getSentimentColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400'
    if (score >= 60) return 'text-yellow-400'
    return 'text-rose-400'
  }
  
  const getSentimentBg = (score: number) => {
    if (score >= 80) return 'bg-emerald-500/10 border-emerald-500/30'
    if (score >= 60) return 'bg-yellow-500/10 border-yellow-500/30'
    return 'bg-rose-500/10 border-rose-500/30'
  }
  
  // Color coding for visibility scores
  const getVisibilityColor = (score: number) => {
    if (score >= 50) return 'text-blue-400'
    if (score >= 25) return 'text-cyan-400'
    return 'text-gray-400'
  }
  
  const getVisibilityBg = (score: number) => {
    if (score >= 50) return 'bg-blue-500/10 border-blue-500/30'
    if (score >= 25) return 'bg-cyan-500/10 border-cyan-500/30'
    return 'bg-gray-500/10 border-gray-500/30'
  }

  // Sentiment label
  const sentimentLabel = useMemo(() => {
    const score = sentiment.overall_score ?? 0
    if (score >= 80) return 'Highly Positive'
    if (score >= 60) return 'Positive'
    if (score >= 40) return 'Neutral'
    if (score >= 20) return 'Negative'
    return 'Highly Negative'
  }, [sentiment.overall_score])

  // Visibility label
  const visibilityLabel = useMemo(() => {
    const score = visibility.overall_visibility_score ?? 0
    if (score >= 70) return 'Excellent'
    if (score >= 50) return 'Strong'
    if (score >= 30) return 'Moderate'
    if (score >= 10) return 'Weak'
    return 'Very Low'
  }, [visibility.overall_visibility_score])

  const sentimentDistribution = sentiment.distribution ?? { Positive: 0, Neutral: 0, Negative: 0 }
  const totalResponses = (sentimentDistribution.Positive ?? 0) + (sentimentDistribution.Neutral ?? 0) + (sentimentDistribution.Negative ?? 0)
  const totalQuestions = (Object.values(visibility.by_model ?? {})[0]?.total_prompts ?? 0) * 3 || 18
  const appearanceRate = visibility.overall_appearance_rate ?? 0
  const timestampLabel = sentimentData.timestamp ? new Date(sentimentData.timestamp).toLocaleString() : 'Unknown'

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">AI Sentiment & Visibility Tracking</h3>
          <p className="text-xs text-muted-foreground">
            Brand: {brand_name} • Industry: {industry} • Service: {service_type}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {timestampLabel}
        </Badge>
      </div>

      {/* Main Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sentiment Score Card */}
        <Card className={cn('rounded-xl border p-6', getSentimentBg(sentiment.overall_score ?? 0))}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/50">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground">AI Sentiment Score</h4>
                <p className="text-xs text-muted-foreground">Based on 5 questions × 3 models</p>
              </div>
            </div>

            {/* Score Display */}
            <div className="flex items-end gap-2">
              <div className={cn('text-6xl font-bold', getSentimentColor(sentiment.overall_score ?? 0))}>
                {sentiment.overall_score ?? 0}
              </div>
              <div className="mb-2">
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
            </div>

            <Badge className={cn('text-sm font-semibold', getSentimentColor(sentiment.overall_score ?? 0))}>
              {sentimentLabel}
            </Badge>

            {/* Distribution Bars */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Distribution ({totalResponses} responses)
              </div>
              
              {/* Positive */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-emerald-400 font-semibold">Positive</span>
                    <span className="text-xs text-muted-foreground">
                      {totalResponses ? Math.round(((sentimentDistribution.Positive ?? 0) / totalResponses) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all"
                      style={{ width: `${totalResponses ? ((sentimentDistribution.Positive ?? 0) / totalResponses) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Negative */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-rose-400 font-semibold">Negative</span>
                    <span className="text-xs text-muted-foreground">
                      {totalResponses ? Math.round(((sentimentDistribution.Negative ?? 0) / totalResponses) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-400 transition-all"
                      style={{ width: `${totalResponses ? ((sentimentDistribution.Negative ?? 0) / totalResponses) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Neutral */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-amber-400 font-semibold">Neutral</span>
                    <span className="text-xs text-muted-foreground">
                      {totalResponses ? Math.round(((sentimentDistribution.Neutral ?? 0) / totalResponses) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all"
                      style={{ width: `${totalResponses ? ((sentimentDistribution.Neutral ?? 0) / totalResponses) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Visibility Score Card */}
        <Card className={cn('rounded-xl border p-6', getVisibilityBg(visibility.overall_visibility_score ?? 0))}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/50">
                <Eye className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground">AI Visibility Score</h4>
                <p className="text-xs text-muted-foreground">Organic brand mentions without prompting</p>
              </div>
            </div>

            {/* Score Display */}
            <div className="flex items-end gap-2">
              <div className={cn('text-6xl font-bold', getVisibilityColor(visibility.overall_visibility_score ?? 0))}>
                {visibility.overall_visibility_score ?? 0}
              </div>
              <div className="mb-2">
                <span className="text-lg text-muted-foreground">%</span>
              </div>
            </div>

            <Badge className={cn('text-sm font-semibold', getVisibilityColor(visibility.overall_visibility_score ?? 0))}>
              {visibilityLabel} Visibility
            </Badge>

            {/* Visibility Metrics */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Appearance Rate</span>
                <span className="text-sm font-semibold text-foreground">
                  {Math.round(appearanceRate * 100)}%
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Discovery Questions</span>
                <span className="text-sm font-semibold text-foreground">{totalQuestions}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Brand Mentioned</span>
                <span className="text-sm font-semibold text-foreground">
                  {Math.round(appearanceRate * totalQuestions)} times
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Model Breakdown */}
      <Card className="rounded-xl border p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Breakdown by AI Model
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(sentiment.by_model ?? {}).map(([model, data]) => {
              const visData = visibility.by_model?.[model]
              const modelScore = data?.score ?? 0
              const modelDistribution = data?.distribution ?? { Positive: 0, Neutral: 0, Negative: 0 }
              return (
                <div key={model} className="bg-background/50 rounded-lg p-4 space-y-3">
                  {/* Model Name */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {model}
                    </span>
                    <Badge variant="outline" className="text-[10px]">AI Model</Badge>
                  </div>

                  {/* Sentiment Score */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Sentiment</div>
                    <div className="flex items-end gap-1">
                      <span className={cn('text-3xl font-bold', getSentimentColor(modelScore))}>
                        {modelScore}
                      </span>
                      <span className="text-xs text-muted-foreground mb-1">/100</span>
                    </div>
                  </div>

                  {/* Visibility Score */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Visibility</div>
                    <div className="flex items-end gap-1">
                      <span className={cn('text-3xl font-bold', getVisibilityColor(visData?.visibility_score ?? 0))}>
                        {visData?.visibility_score ?? 0}
                      </span>
                      <span className="text-xs text-muted-foreground mb-1">%</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {(visData?.appearances ?? 0)}/{(visData?.total_prompts ?? 0)} mentions
                    </div>
                  </div>

                  {/* Distribution */}
                  <div className="pt-2 border-t border-border/50">
                    <div className="text-[10px] text-muted-foreground mb-1">Sentiment Mix</div>
                    <div className="flex gap-1">
                      <div 
                        className="h-1.5 bg-emerald-400 rounded-full"
                        style={{ width: `${((modelDistribution.Positive ?? 0) / 5) * 100}%` }}
                        title={`Positive: ${modelDistribution.Positive ?? 0}`}
                      />
                      <div 
                        className="h-1.5 bg-rose-400 rounded-full"
                        style={{ width: `${((modelDistribution.Negative ?? 0) / 5) * 100}%` }}
                        title={`Negative: ${modelDistribution.Negative ?? 0}`}
                      />
                      <div 
                        className="h-1.5 bg-amber-400 rounded-full"
                        style={{ width: `${((modelDistribution.Neutral ?? 0) / 5) * 100}%` }}
                        title={`Neutral: ${modelDistribution.Neutral ?? 0}`}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Insights Panel */}
      <Card className="rounded-xl border p-6 bg-gradient-to-br from-purple-500/5 to-blue-500/5">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-purple-400" />
            What This Means
          </h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>
                <strong>Sentiment Score:</strong> How positively AI models perceive your brand when asked directly (0-100)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>
                <strong>Visibility Score:</strong> How often AI recommends your brand organically without being prompted (0-100%)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5">•</span>
              <span>
                <strong>Higher scores:</strong> Better AI perception and stronger organic recommendations in AI-powered search
              </span>
            </li>
          </ul>
        </div>
      </Card>
    </div>
  )
}
