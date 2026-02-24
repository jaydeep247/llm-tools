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
import { cn } from '@/lib/utils'
import { useGetModuleCResultQuery } from '@/store/api/module_C/moduleCApi'
import { useState, useMemo } from 'react'

interface AIAnswerPreviewProps {
  jobId?: string | null
}

// Mini progress bar component
function MiniProgress({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
      <div 
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export default function AIAnswerPreview({ jobId }: AIAnswerPreviewProps) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  
  const { 
    data: moduleCData, 
    isLoading, 
    refetch 
  } = useGetModuleCResultQuery(jobId || '', { 
    skip: !jobId,
    refetchOnMountOrArgChange: true
  })

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
    'gpt': { bg: 'bg-white/[0.05]', icon: 'text-emerald-400', accent: 'border-emerald-500/30' },
    'claude': { bg: 'bg-white/[0.05]', icon: 'text-orange-400', accent: 'border-orange-500/30' },
    'gemini': { bg: 'bg-white/[0.05]', icon: 'text-blue-400', accent: 'border-blue-500/30' },
    'llama': { bg: 'bg-white/[0.05]', icon: 'text-purple-400', accent: 'border-purple-500/30' },
    'mistral': { bg: 'bg-white/[0.05]', icon: 'text-cyan-400', accent: 'border-cyan-500/30' },
  }

  const getModelColor = (model: string) => {
    const lowerModel = model.toLowerCase()
    for (const [key, colors] of Object.entries(modelColors)) {
      if (lowerModel.includes(key)) return colors
    }
    return { bg: 'bg-white/[0.05]', icon: 'text-white/70', accent: 'border-white/[0.08]' }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Answer Preview</h2>
          <p className="text-sm text-white/50 mt-1">
            How AI models respond to queries about your content
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          variant="outline"
          size="sm"
          disabled={isLoading}
          className="bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-white/60" />
        </div>
      )}

      {/* Content */}
      {!isLoading && llmSimulator ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Query & Stats */}
          <div className="space-y-4">
            {/* Test Query Card */}
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                </div>
                <span className="text-sm font-medium text-white/70">Test Query</span>
              </div>
              <p className="text-white text-sm leading-relaxed">
                {llmSimulator.query || 'No query specified'}
              </p>
            </div>

            {/* Average Scores */}
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
              <h3 className="text-sm font-medium text-white/70 mb-4">Average Performance</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/50">Accuracy</span>
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
                    <span className="text-xs text-white/50">Completeness</span>
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

              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">Models Tested</span>
                  <span className="text-lg font-bold text-white">{models.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Column - Model List */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-white/50" />
                <span className="text-sm font-medium text-white">Model Responses</span>
              </div>
            </div>

            <div className="divide-y divide-white/5 max-h-125 overflow-y-auto">
              {models.map(([model, data]) => {
                const colors = getModelColor(model)
                const isSelected = selectedModel === model
                
                return (
                  <div 
                    key={model}
                    onClick={() => setSelectedModel(isSelected ? null : model)}
                    className={cn(
                      "p-4 cursor-pointer transition-all",
                      isSelected ? "bg-white/5" : "hover:bg-white/5"
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
                            "w-4 h-4 text-white/30 transition-transform",
                            isSelected && "rotate-90"
                          )} />
                        </div>
                        <p className="text-xs text-white/50 truncate mt-0.5">
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
                        <span className="text-xs text-white/60">
                          {data.accuracy_score ?? 0}% acc
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(data.completeness_score ?? 0) >= 50 ? (
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-400" />
                        )}
                        <span className="text-xs text-white/60">
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
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            {selectedModel && llmSimulator.simulations?.[selectedModel] ? (
              <>
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-xl", getModelColor(selectedModel).bg)}>
                      <Cpu className={cn("w-5 h-5", getModelColor(selectedModel).icon)} />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white capitalize">
                        {selectedModel.replace(/_/g, ' ')}
                      </span>
                      <p className="text-xs text-white/50">Full Response</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Scores */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/50">Accuracy</div>
                      <div className={cn(
                        "text-xl font-bold mt-1",
                        (llmSimulator.simulations[selectedModel].accuracy_score ?? 0) >= 70 ? "text-emerald-400" :
                        (llmSimulator.simulations[selectedModel].accuracy_score ?? 0) >= 50 ? "text-yellow-400" : "text-red-400"
                      )}>
                        {llmSimulator.simulations[selectedModel].accuracy_score ?? 0}%
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/50">Completeness</div>
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
                    <div className="text-xs text-white/50 uppercase tracking-wider mb-2">Response</div>
                    <div className="bg-white/5 rounded-xl p-4 max-h-48 overflow-y-auto">
                      <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
                        {llmSimulator.simulations[selectedModel].answer || 'No response available'}
                      </p>
                    </div>
                  </div>

                  {/* Evaluation */}
                  {llmSimulator.simulations[selectedModel].eval_explanation && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                      <div className="text-xs text-amber-400 font-medium mb-1">Evaluation Notes</div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        {llmSimulator.simulations[selectedModel].eval_explanation}
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-sm text-white/50">Select a model to view details</p>
              </div>
            )}
          </div>
        </div>
      ) : !isLoading ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-12 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Eye className="w-8 h-8 text-white/30" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No AI Answer Preview Data</h3>
          <p className="text-sm text-white/50">
            Run an AI Visibility analysis to see how AI models respond to queries about your content.
          </p>
        </div>
      ) : null}
    </div>
  )
}
