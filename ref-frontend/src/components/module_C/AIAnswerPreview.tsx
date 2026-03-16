'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Loader2, 
  Eye, 
  Cpu, 
  RefreshCw,
  MessageSquare,
  CheckCircle,
  XCircle,
  ChevronRight,
  Sparkles,
  Bot
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { useGetModuleCResultQuery, useRunModuleCAnalysisMutation } from '@/store/api/module_C/moduleCApi'
import { useGetJobStatusQuery } from '@/store/api/jobApi'
import { useState, useMemo, useEffect } from 'react'

interface AIAnswerPreviewProps {
  jobId?: string | null
  url?: string
}

// Mini progress bar component
function MiniProgress({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
      <div 
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export default function AIAnswerPreview({ jobId, url = '' }: AIAnswerPreviewProps) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
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
  })

  const [runAnalysis] = useRunModuleCAnalysisMutation()

  const { data: analysisJobData } = useGetJobStatusQuery(analysisJobId || '', {
    skip: !analysisJobId,
    pollingInterval: analysisJobId ? 2000 : 0,
  })

  useEffect(() => {
    if (analysisJobData?.status === 'COMPLETED' || analysisJobData?.status === 'FAILED') {
      setAnalysisJobId(null)
      if (analysisJobData?.status === 'COMPLETED') {
        refetch()
      }
    }
  }, [analysisJobData?.status, refetch])

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

  const isAnalyzing = !!analysisJobId

  const result = moduleCData?.data
  const llmSimulator = result?.modules?.llm_simulator

  const models = useMemo(() => {
    if (!llmSimulator?.simulations) return []
    return Object.entries(llmSimulator.simulations)
  }, [llmSimulator?.simulations])

  // Calculate averages
  const avgAccuracy = useMemo(() => {
    if (!models.length) return 0
    const sum = models.reduce((acc, [, data]) => acc + (data.accuracy_score ?? 0), 0)
    return Math.round(sum / models.length)
  }, [models])

  const avgCompleteness = useMemo(() => {
    if (!models.length) return 0
    const sum = models.reduce((acc, [, data]) => acc + (data.completeness_score ?? 0), 0)
    return Math.round(sum / models.length)
  }, [models])

  // Model colors mapping
  const modelColors: Record<string, { bg: string; icon: string; accent: string }> = {
    'gpt': { bg: 'bg-zinc-800/50', icon: 'text-emerald-400', accent: 'border-emerald-500/30' },
    'claude': { bg: 'bg-zinc-800/50', icon: 'text-orange-400', accent: 'border-orange-500/30' },
    'gemini': { bg: 'bg-zinc-800/50', icon: 'text-blue-400', accent: 'border-blue-500/30' },
    'llama': { bg: 'bg-zinc-800/50', icon: 'text-blue-400', accent: 'border-blue-500/30' },
    'mistral': { bg: 'bg-zinc-800/50', icon: 'text-cyan-400', accent: 'border-cyan-500/30' },
  }

  const getModelColor = (model: string) => {
    const lowerModel = model.toLowerCase()
    for (const [key, colors] of Object.entries(modelColors)) {
      if (lowerModel.includes(key)) return colors
    }
    return { bg: 'bg-zinc-800/50', icon: 'text-zinc-300', accent: 'border-zinc-800' }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Answer Preview</h2>
          <p className="text-sm text-zinc-400 mt-1">
            How AI models respond to queries about your content
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
      {!isLoading && llmSimulator ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Query & Stats */}
          <div className="space-y-4">
            {/* Test Query Card */}
            <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-sm font-medium text-zinc-300">Test Query</span>
              </div>
              <p className="text-white text-sm leading-relaxed">
                {llmSimulator.query || 'No query specified'}
              </p>
            </div>

            {/* Average Scores */}
            <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-300 mb-4">Average Performance</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-400">Accuracy</span>
                    <span className={cn(
                      "text-sm font-bold",
                      avgAccuracy >= 70 ? "text-emerald-400" :
                      avgAccuracy >= 50 ? "text-yellow-400" : "text-red-400"
                    )}>{avgAccuracy}%</span>
                  </div>
                  <MiniProgress 
                    value={avgAccuracy} 
                    color={avgAccuracy >= 70 ? "bg-emerald-500" : avgAccuracy >= 50 ? "bg-yellow-500" : "bg-red-500"}
                  />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-400">Completeness</span>
                    <span className={cn(
                      "text-sm font-bold",
                      avgCompleteness >= 70 ? "text-emerald-400" :
                      avgCompleteness >= 50 ? "text-yellow-400" : "text-red-400"
                    )}>{avgCompleteness}%</span>
                  </div>
                  <MiniProgress 
                    value={avgCompleteness} 
                    color={avgCompleteness >= 70 ? "bg-emerald-500" : avgCompleteness >= 50 ? "bg-yellow-500" : "bg-red-500"}
                  />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Models Tested</span>
                  <span className="text-lg font-bold text-white">{models.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Column - Model List */}
          <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-white">Model Responses</span>
              </div>
            </div>

            <div className="divide-y divide-zinc-800/50 max-h-125 overflow-y-auto">
              {models.map(([model, data]) => {
                const colors = getModelColor(model)
                const isSelected = selectedModel === model
                
                return (
                  <div 
                    key={model}
                    onClick={() => setSelectedModel(isSelected ? null : model)}
                    className={cn(
                      "p-4 cursor-pointer transition-all",
                      isSelected ? "bg-zinc-800/50" : "hover:bg-zinc-800/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl", colors.bg)}>
                        <Cpu className={cn("w-5 h-5", colors.icon)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white capitalize">
                            {model.replace(/_/g, ' ')}
                          </span>
                          <ChevronRight className={cn(
                            "w-4 h-4 text-zinc-600 transition-transform",
                            isSelected && "rotate-90"
                          )} />
                        </div>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {data.answer?.substring(0, 60) || 'No response'}...
                        </p>
                      </div>
                    </div>
                    
                    {/* Mini Scores */}
                    <div className="flex gap-4 mt-3 pl-12">
                      <div className="flex items-center gap-1.5">
                        {(data.accuracy_score ?? 0) >= 50 ? (
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-400" />
                        )}
                        <span className="text-xs text-zinc-400">
                          {data.accuracy_score ?? 0}% acc
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(data.completeness_score ?? 0) >= 50 ? (
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-400" />
                        )}
                        <span className="text-xs text-zinc-400">
                          {data.completeness_score ?? 0}% comp
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Column - Selected Response */}
          <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 overflow-hidden">
            {selectedModel && llmSimulator.simulations?.[selectedModel] ? (
              <>
                <div className="p-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-xl", getModelColor(selectedModel).bg)}>
                      <Cpu className={cn("w-5 h-5", getModelColor(selectedModel).icon)} />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white capitalize">
                        {selectedModel.replace(/_/g, ' ')}
                      </span>
                      <p className="text-xs text-zinc-400">Full Response</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Scores */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Accuracy</div>
                      <div className={cn(
                        "text-xl font-bold mt-1",
                        (llmSimulator.simulations[selectedModel].accuracy_score ?? 0) >= 70 ? "text-emerald-400" :
                        (llmSimulator.simulations[selectedModel].accuracy_score ?? 0) >= 50 ? "text-yellow-400" : "text-red-400"
                      )}>
                        {llmSimulator.simulations[selectedModel].accuracy_score ?? 0}%
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-800">
                      <div className="text-xs text-zinc-400">Completeness</div>
                      <div className={cn(
                        "text-xl font-bold mt-1",
                        (llmSimulator.simulations[selectedModel].completeness_score ?? 0) >= 70 ? "text-emerald-400" :
                        (llmSimulator.simulations[selectedModel].completeness_score ?? 0) >= 50 ? "text-yellow-400" : "text-red-400"
                      )}>
                        {llmSimulator.simulations[selectedModel].completeness_score ?? 0}%
                      </div>
                    </div>
                  </div>

                  {/* Response */}
                  <div>
                    <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Response</div>
                    <div className="bg-zinc-800/50 rounded-xl p-4 max-h-48 overflow-y-auto">
                      <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                        {llmSimulator.simulations[selectedModel].answer || 'No response available'}
                      </p>
                    </div>
                  </div>

                  {/* Evaluation */}
                  {llmSimulator.simulations[selectedModel].eval_explanation && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                      <div className="text-xs text-amber-400 font-medium mb-1">Evaluation Notes</div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {llmSimulator.simulations[selectedModel].eval_explanation}
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-zinc-700" />
                </div>
                <p className="text-sm text-zinc-400">Select a model to view details</p>
              </div>
            )}
          </div>
        </div>
      ) : !isLoading ? (
        <AnalysisEmptyState
          icon={<Eye className="w-8 h-8 text-zinc-600" />}
          title="No AI Answer Preview Data"
          description="Run an AI Visibility analysis to see how AI models respond to queries about your content."
          onRunAnalysis={handleRunAnalysis}
          isAnalyzing={isAnalyzing}
          disabled={!jobId}
        />
      ) : null}
    </div>
  )
}
