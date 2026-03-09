'use client'

import { useState } from 'react'
import { Download, ChevronDown, ChevronUp, Sparkles, FileSpreadsheet, Cpu, BookOpen, Layers, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGetModuleCResultQuery } from '@/store/api/module_C/moduleCApi'
import {
  createWorkbook,
  addSheet,
  downloadWorkbook,
} from '@/utils/excelExport'

interface ModuleCExportProps {
  jobId?: string
  sessionName?: string
}

// ── transform helpers ────────────────────────────────────────────────────────

function transformAiPresence(modules: any) {
  const ap = modules?.ai_presence
  if (!ap) return []

  const rc = ap.robots_checks || {}
  const cc = ap.content_checks || {}
  const mmc = ap.multi_model_consensus || {}

  const baseRow: Record<string, any> = {
    'AI Presence Score': ap.score ?? 0,
    'Robots GPTBot': rc.robots_gptbot ? 'Allowed' : 'Blocked',
    'Robots Google Extended': rc.robots_google_extended ? 'Allowed' : 'Blocked',
    'Robots ClaudeBot': rc.robots_claudebot ? 'Allowed' : 'Blocked',
    'Sitemap Present': rc.sitemap_present ? 'Yes' : 'No',
    'Org Schema Present': cc.org_schema_present ? 'Yes' : 'No',
    'Org Logo Present': cc.org_logo_present ? 'Yes' : 'No',
    'SameAs Wikipedia': cc.sameas_wikidata_or_wikipedia ? 'Yes' : 'No',
    'SameAs Major Profiles': cc.sameas_major_profiles_count ?? 0,
    'Open Graph Present': cc.open_graph_present ? 'Yes' : 'No',
    'Twitter Card Present': cc.twitter_card_present ? 'Yes' : 'No',
    'Consistency Score': mmc.consistency_score ?? 0,
    'Variation Rating': mmc.variation_rating || '',
  }

  // Per-model understanding
  const aiUnderstanding = ap.ai_understanding || {}
  Object.entries(aiUnderstanding).forEach(([model, val]: [string, any]) => {
    baseRow[`${model} Score`] = val?.score ?? 0
    baseRow[`${model} Level`] = val?.understanding_level || ''
  })

  return [baseRow]
}

function transformAnswerability(modules: any) {
  const an = modules?.answerability
  if (!an) return []

  const metrics = an.metrics || {}
  const multiScores = an.multi_model_scores || {}
  const row: Record<string, any> = {
    'Answerability Score': an.score ?? 0,
    'Completeness Score': an.completeness_score ?? 0,
    'Depth Score': an.depth_score ?? 0,
    'Breadth Score': an.breadth_score ?? 0,
    'Readability Score': an.readability_score ?? 0,
    'Question Count': metrics.question_count ?? 0,
    'Answer Count': metrics.answer_count ?? 0,
    'QA Balance': metrics.qa_balance ?? 0,
    '% Questions Answered': metrics.percent_questions_answered ?? 0,
    'AI Answerability Score': an.ai_analysis?.ai_answerability_score ?? 0,
  }

  Object.entries(multiScores).forEach(([model, score]: [string, any]) => {
    row[`${model} Score`] = score ?? 0
  })

  return [row]
}

function transformKnowledgeBase(modules: any) {
  const kb = modules?.knowledge_base
  if (!kb) return []

  const ec = kb.entity_coverage || {}
  const baseRow: Record<string, any> = {
    'Knowledge Base Score': kb.score ?? 0,
    'Fact Density': kb.fact_density ?? 0,
    'Entity Coverage Topic': ec.topic || '',
    'Coverage Score': ec.coverage_score ?? 0,
    'Gap %': ec.gap_percentage ?? 0,
    'Critical Entities Count': ec.critical_entities_count ?? 0,
    'Minor Entities Count': ec.minor_entities_count ?? 0,
    'Found Entities': (ec.found_entities ?? []).join(', '),
    'Missing Entities': (ec.missing_entities ?? []).join(', '),
  }

  return [baseRow]
}

function transformEntityDetails(modules: any) {
  const entities = modules?.knowledge_base?.entity_coverage?.entites_analysis ?? []
  return entities.map((e: any) => ({
    Entity: e.entity || '',
    Type: e.type || '',
    'Relevance Score': e.relevance_score ?? 0,
    Status: e.status || '',
    Importance: e.importance || '',
  }))
}

function transformActionableInsights(modules: any) {
  const ai = modules?.actionable_insights
  if (!ai?.actions) return []
  return ai.actions.map((a: any) => ({
    ID: a.id || '',
    Type: a.type || '',
    Description: a.description || '',
    Priority: a.priority || '',
    Impact: a.impact ?? 0,
    Category: a.category || '',
  }))
}

function transformLlmSimulator(modules: any) {
  const llm = modules?.llm_simulator
  if (!llm?.simulations) return []
  return Object.entries(llm.simulations).map(([model, sim]: [string, any]) => ({
    Model: model,
    Query: llm.query || '',
    'Accuracy Score': sim.accuracy_score ?? 0,
    'Completeness Score': sim.completeness_score ?? 0,
    'Eval Explanation': sim.eval_explanation || '',
  }))
}

// ────────────────────────────────────────────────────────────────────────────

interface ExportOption {
  id: string
  label: string
  description: string
  icon: React.ElementType
  color: string
  dataKey: string
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'ai-presence',
    label: 'AI Presence',
    description: 'Robot accessibility, schema, Open Graph and multi-model understanding scores.',
    icon: Sparkles,
    color: 'text-violet-400',
    dataKey: 'ai_presence',
  },
  {
    id: 'answerability',
    label: 'Answerability',
    description: 'QA coverage, completeness, depth, breadth and readability scores.',
    icon: BookOpen,
    color: 'text-blue-400',
    dataKey: 'answerability',
  },
  {
    id: 'knowledge-base',
    label: 'Knowledge Base & Entities',
    description: 'Fact density, entity coverage and gap analysis.',
    icon: Layers,
    color: 'text-emerald-400',
    dataKey: 'knowledge_base',
  },
  {
    id: 'llm-simulator',
    label: 'LLM Simulator',
    description: 'Simulated AI model responses with accuracy and completeness scores.',
    icon: Cpu,
    color: 'text-amber-400',
    dataKey: 'llm_simulator',
  },
  {
    id: 'actionable-insights',
    label: 'Actionable Insights',
    description: 'Improvement actions with priority, impact and category.',
    icon: Zap,
    color: 'text-rose-400',
    dataKey: 'actionable_insights',
  },
  {
    id: 'all',
    label: 'Full AI Intelligence (All Sheets)',
    description: 'All AI intelligence analysis in one Excel workbook.',
    icon: FileSpreadsheet,
    color: 'text-indigo-400',
    dataKey: '',
  },
]

export default function ModuleCExport({ jobId, sessionName = 'session' }: ModuleCExportProps) {
  const [expanded, setExpanded] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data: moduleCData, isLoading } = useGetModuleCResultQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const modules = moduleCData?.data?.modules

  const getCount = (key: string): number => {
    if (!modules) return 0
    if (key === 'actionable_insights') return modules.actionable_insights?.actions?.length ?? 0
    if (key === 'llm_simulator') return Object.keys(modules.llm_simulator?.simulations ?? {}).length
    if (key === 'knowledge_base') return (modules.knowledge_base?.entity_coverage?.entites_analysis?.length ?? 0) + 1
    return modules[key as keyof typeof modules] ? 1 : 0
  }

  const handleDownload = async (optionId: string) => {
    if (!modules) return
    setDownloading(optionId)
    try {
      const wb = createWorkbook()
      const date = new Date().toISOString().split('T')[0]
      const filename = `${sessionName}_module-C_${optionId}_${date}`

      if (optionId === 'ai-presence' || optionId === 'all') {
        addSheet(wb, transformAiPresence(modules), 'AI Presence')
      }
      if (optionId === 'answerability' || optionId === 'all') {
        addSheet(wb, transformAnswerability(modules), 'Answerability')
      }
      if (optionId === 'knowledge-base' || optionId === 'all') {
        addSheet(wb, transformKnowledgeBase(modules), 'Knowledge Base')
        const entities = transformEntityDetails(modules)
        if (entities.length > 0) addSheet(wb, entities, 'Entity Details')
      }
      if (optionId === 'llm-simulator' || optionId === 'all') {
        addSheet(wb, transformLlmSimulator(modules), 'LLM Simulator')
      }
      if (optionId === 'actionable-insights' || optionId === 'all') {
        addSheet(wb, transformActionableInsights(modules), 'Actionable Insights')
      }

      downloadWorkbook(wb, filename)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setDownloading(null)
    }
  }

  const hasData = !!modules

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">AI Intelligence (Module C)</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              AI presence, answerability, knowledge base, LLM simulator, actionable insights
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!hasData && !isLoading && (
            <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700 text-[10px]">No data</Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Export options */}
      {expanded && (
        <div className="border-t border-zinc-800/60 divide-y divide-zinc-800/40">
          {EXPORT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const count = getCount(opt.dataKey)
            const isDownloading = downloading === opt.id
            const disabled = isLoading || !hasData || !!downloading

            return (
              <div
                key={opt.id}
                className={`flex items-center justify-between px-5 py-3.5 gap-4 ${
                  opt.id === 'all' ? 'bg-indigo-500/5' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${opt.color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{opt.label}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{opt.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-zinc-600">
                    {opt.id === 'all' ? '5 sheets' : `${count.toLocaleString()} rows`}
                  </span>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => handleDownload(opt.id)}
                    className={`h-8 px-3 text-xs rounded-xl cursor-pointer ${
                      opt.id === 'all'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
                    }`}
                    variant="ghost"
                  >
                    {isDownloading ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                        Exporting…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Download className="h-3 w-3" />
                        .xlsx
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
