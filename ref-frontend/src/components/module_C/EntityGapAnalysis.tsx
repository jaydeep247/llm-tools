'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Loader2, 
  Database, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Search,
  Hash,
  TrendingUp,
  AlertTriangle,
  Target,
  Play
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetModuleCResultQuery, useRunModuleCAnalysisMutation } from '@/store/api/module_C/moduleCApi'
import { useGetJobStatusQuery } from '@/store/api/jobApi'
import { useState, useMemo, useEffect } from 'react'

interface EntityGapAnalysisProps {
  jobId?: string | null
  url?: string
}

// Donut Chart Component
function DonutChart({ 
  value, 
  size = 120, 
  strokeWidth = 12,
  label 
}: { 
  value: number
  size?: number
  strokeWidth?: number
  label?: string 
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#10b981"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{value}</span>
        <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{label || 'Coverage'}</span>
      </div>
    </div>
  )
}

export default function EntityGapAnalysis({ jobId, url = '' }: EntityGapAnalysisProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)
  
  const { 
    data: moduleCData, 
    isLoading, 
    refetch 
  } = useGetModuleCResultQuery(jobId || '', { 
    skip: !jobId,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    pollingInterval: 5000,
  })

  const [runAnalysis, { isLoading: isRunning }] = useRunModuleCAnalysisMutation()

  // Poll for analysis job status
  const { data: analysisJobData } = useGetJobStatusQuery(analysisJobId || '', {
    skip: !analysisJobId,
    pollingInterval: analysisJobId ? 2000 : 0,
  })

  // Check if analysis job is complete
  useEffect(() => {
    if (analysisJobData?.status === 'COMPLETED') {
      setAnalysisJobId(null)
      refetch()
    } else if (analysisJobData?.status === 'FAILED') {
      setAnalysisJobId(null)
    }
  }, [analysisJobData, refetch])

  const handleRunAnalysis = async () => {
    if (!jobId) return
    try {
      const result = await runAnalysis({ jobId, url }).unwrap()
      if (result.data?.analysisJobId) {
        setAnalysisJobId(result.data.analysisJobId)
      }
    } catch (error) {
      console.error('Failed to start analysis:', error)
    }
  }

  const isAnalyzing = isRunning || !!analysisJobId

  const result = moduleCData?.data
  const knowledgeBase = result?.modules?.knowledge_base

  // Filter entities based on search
  const filteredEntities = useMemo(() => {
    if (!knowledgeBase?.entity_coverage?.entites_analysis) return []
    const query = searchQuery.toLowerCase()
    return knowledgeBase.entity_coverage.entites_analysis.filter(entity => 
      entity.entity?.toLowerCase().includes(query) ||
      entity.type?.toLowerCase().includes(query)
    )
  }, [knowledgeBase?.entity_coverage?.entites_analysis, searchQuery])

  // Group entities by type
  const entityTypes = useMemo(() => {
    if (!knowledgeBase?.entity_coverage?.entites_analysis) return {}
    return knowledgeBase.entity_coverage.entites_analysis.reduce((acc, entity) => {
      const type = entity.type || 'Other'
      if (!acc[type]) acc[type] = []
      acc[type].push(entity)
      return acc
    }, {} as Record<string, typeof knowledgeBase.entity_coverage.entites_analysis>)
  }, [knowledgeBase?.entity_coverage?.entites_analysis])

  const foundCount = knowledgeBase?.entity_coverage?.found_entities?.length ?? 0
  const missingCount = knowledgeBase?.entity_coverage?.missing_entities?.length ?? 0
  const totalEntities = foundCount + missingCount

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Entity & Gap Analysis</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Identified entities and content gaps in your content
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          variant="outline"
          size="sm"
          disabled={isLoading}
          className="bg-zinc-800/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      )}

      {/* Content */}
      {!isLoading && knowledgeBase?.entity_coverage ? (
        <>
          {/* Top Stats Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Coverage Donut Card */}
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-zinc-800">
              <div className="flex items-center gap-6">
                <DonutChart 
                  value={knowledgeBase.entity_coverage.coverage_score ?? 0} 
                  size={100}
                  strokeWidth={10}
                />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">Entity Coverage</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs text-zinc-400">Found</span>
                      <span className="text-sm font-bold text-white ml-auto">{foundCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-xs text-zinc-400">Missing</span>
                      <span className="text-sm font-bold text-white ml-auto">{missingCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-zinc-500" />
                      <span className="text-xs text-zinc-400">Total</span>
                      <span className="text-sm font-bold text-white ml-auto">{totalEntities}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Entity Counts Card */}
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-300 mb-4">Entity Breakdown</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                      <Target className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-xs text-zinc-400">Critical</span>
                  </div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {knowledgeBase.entity_coverage.critical_entities_count ?? 0}
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-blue-500/20 rounded-lg">
                      <Hash className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="text-xs text-zinc-400">Minor</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-400">
                    {knowledgeBase.entity_coverage.minor_entities_count ?? 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Topic & Density Card */}
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-300 mb-4">Content Analysis</h3>
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-zinc-400 uppercase tracking-wider">Topic Identified</span>
                  <p className="text-white font-semibold mt-1 truncate" title={knowledgeBase.entity_coverage.topic || 'N/A'}>
                    {knowledgeBase.entity_coverage.topic || 'N/A'}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-zinc-400 uppercase tracking-wider">Fact Density</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xl font-bold text-white">{knowledgeBase.fact_density?.toFixed(2) ?? '--'}</span>
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-400">per 100 words</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Entity Tags Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Found Entities */}
            <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-sm font-medium text-white">Found Entities</span>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-0">
                  {foundCount}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {knowledgeBase.entity_coverage.found_entities?.map((entity, i) => (
                  <span 
                    key={i} 
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg text-xs text-zinc-200 transition-colors cursor-default"
                  >
                    <Hash className="w-3 h-3 text-emerald-400" />
                    {entity}
                  </span>
                ))}
                {foundCount === 0 && (
                  <span className="text-zinc-500 text-sm">No entities found</span>
                )}
              </div>
            </div>

            {/* Missing Entities */}
            <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  </div>
                  <span className="text-sm font-medium text-white">Missing Entities</span>
                </div>
                <Badge className="bg-red-500/20 text-red-400 border-0">
                  {missingCount}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {knowledgeBase.entity_coverage.missing_entities?.map((entity, i) => (
                  <span 
                    key={i} 
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 rounded-lg text-xs text-red-300 transition-colors cursor-default"
                  >
                    <Hash className="w-3 h-3 text-red-400" />
                    {entity}
                  </span>
                ))}
                {missingCount === 0 && (
                  <span className="text-emerald-400 text-sm flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> All entities covered
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* KB Recommendations Section */}
          {knowledgeBase.entity_coverage.recommendations && knowledgeBase.entity_coverage.recommendations.length > 0 && (
            <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                </div>
                <span className="text-sm font-medium text-white">Knowledge Base Recommendations</span>
                <Badge className="bg-amber-500/20 text-amber-300 border-0 ml-auto">
                  {knowledgeBase.entity_coverage.recommendations.length} actions
                </Badge>
              </div>
              <div className="p-4 space-y-3">
                {knowledgeBase.entity_coverage.recommendations.map((rec, i) => (
                  <div 
                    key={i}
                    className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-800/50"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <Badge className={cn(
                        "border text-xs",
                        rec.priority === 'High' ? "bg-red-500/20 text-red-300 border-red-500/30" :
                        rec.priority === 'Medium' ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                        "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      )}>
                        {rec.priority}
                      </Badge>
                      <div className="flex items-center gap-1 text-emerald-400">
                        <span className="text-xs font-semibold">+{rec.impact}</span>
                        <span className="text-[10px] text-zinc-500">impact</span>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-300">{rec.action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entity Types Grid */}
          {Object.keys(entityTypes).length > 0 && (
            <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="p-4 border-b border-zinc-800/50 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <h3 className="text-sm font-medium text-white">Entity Analysis by Type</h3>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    placeholder="Search entities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-zinc-800/50 border-zinc-800 text-white placeholder:text-zinc-500 text-sm h-9"
                  />
                </div>
              </div>

              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(entityTypes).map(([type, entities]) => {
                  const filteredTypeEntities = entities.filter(e => 
                    searchQuery === '' || 
                    e.entity?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  if (filteredTypeEntities.length === 0) return null

                  const typeColors: Record<string, { bg: string; border: string; text: string }> = {
                    'Person': { bg: 'bg-zinc-800/30', border: 'border-blue-500/30', text: 'text-blue-400' },
                    'Organization': { bg: 'bg-zinc-800/30', border: 'border-blue-500/30', text: 'text-blue-400' },
                    'Location': { bg: 'bg-zinc-800/30', border: 'border-amber-500/30', text: 'text-amber-400' },
                    'Concept': { bg: 'bg-zinc-800/30', border: 'border-cyan-500/30', text: 'text-cyan-400' },
                    'Product': { bg: 'bg-zinc-800/30', border: 'border-emerald-500/30', text: 'text-emerald-400' },
                    'Date': { bg: 'bg-zinc-800/30', border: 'border-pink-500/30', text: 'text-pink-400' },
                  }
                  const colors = typeColors[type] || { bg: 'bg-zinc-800/30', border: 'border-zinc-800', text: 'text-zinc-300' }

                  return (
                    <div 
                      key={type}
                      className={cn("rounded-xl p-4 border", colors.bg, colors.border)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className={cn("text-sm font-medium", colors.text)}>{type}</span>
                        <span className="text-xs text-zinc-400">{filteredTypeEntities.length} items</span>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {filteredTypeEntities.map((entity, i) => (
                          <div 
                            key={i}
                            className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50"
                          >
                            <span className="text-sm text-white truncate flex-1">{entity.entity}</span>
                            <div className="flex items-center gap-2 ml-2">
                              <span className={cn(
                                "text-xs font-medium",
                                entity.status === 'Found' ? "text-emerald-400" : "text-red-400"
                              )}>
                                {entity.status === 'Found' ? '✓' : '✗'}
                              </span>
                              <span className="text-xs text-zinc-400">{entity.relevance_score}/10</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : !isLoading ? (
        <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 p-12 text-center">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Database className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No Entity Analysis Data</h3>
          <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
            Run an AI Visibility analysis to see entity coverage and gap analysis.
          </p>
          <Button
            onClick={handleRunAnalysis}
            disabled={!jobId || isAnalyzing}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Analysis...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run AI Visibility Analysis
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
