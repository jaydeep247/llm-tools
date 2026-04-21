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
  const c1 = modules?.aeo_checker
  if (!c1) return []

  const subScores = c1.sub_scores || {}
  const crawl = c1.crawl_access || {}
  const schema = c1.schema_signals || {}
  const authority = c1.authority_signals || {}

  const baseRow: Record<string, any> = {
    'LLM Friendliness Score': c1.llm_friendliness_score ?? 0,
    'Page Topic': c1.page_topic || '',
    'Page Type': c1.page_type || '',
    'Crawl Access': subScores.crawl_access ?? 0,
    'Schema Signals': subScores.schema ?? 0,
    'Content Structure': subScores.content ?? 0,
    'Tech Hygiene': subScores.tech_hygiene ?? 0,
    'Structure': subScores.structure ?? 0,
  }

  Object.entries(crawl).forEach(([key, val]: [string, any]) => {
    baseRow[`Crawl: ${key}`] = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : val
  })
  Object.entries(schema).forEach(([key, val]: [string, any]) => {
    baseRow[`Schema: ${key}`] = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : val
  })
  Object.entries(authority).forEach(([key, val]: [string, any]) => {
    baseRow[`Authority: ${key}`] = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : val
  })

  return [baseRow]
}

function transformAnswerability(modules: any) {
  const c4 = modules?.answer_completeness
  if (!c4) return []

  return [{
    'Completeness Score': c4.completeness_score ?? 0,
    'Pct Fully Answered': c4.pct_fully_answered ?? 0,
    'Questions Generated': c4.questions_generated ?? 0,
    'Fully Answered': c4.fully_answered ?? 0,
    'Partially Answered': c4.partially_answered ?? 0,
    'Not Answered': c4.not_answered ?? 0,
  }]
}

function transformKnowledgeBase(modules: any) {
  const c3 = modules?.entity_coverage
  if (!c3) return []

  const missingNames = new Set((c3.missing_entities ?? []).map((e: any) => e.name))
  const foundEntities = (c3.entity_relevance ?? [])
    .filter((e: any) => !missingNames.has(e.entity || e.name))
    .map((e: any) => (e.entity || e.name) as string)

  return [{
    'Entity Coverage %': c3.entity_coverage_pct ?? c3.coverage?.entity_coverage_pct ?? 0,
    'Topic': c3.page_type || c3.topic || '',
    'Found Entities': foundEntities.join(', '),
    'Missing Entities': (c3.missing_entities ?? []).map((e: any) => e.name).join(', '),
  }]
}

function transformEntityDetails(modules: any) {
  const c3 = modules?.entity_coverage
  if (!c3) return []

  const missingNames = new Set((c3.missing_entities ?? []).map((e: any) => e.name))
  const entities: any[] = []

  if (c3.entity_relevance && c3.entity_relevance.length > 0) {
    c3.entity_relevance.forEach((e: any) => {
      entities.push({
        Entity: e.entity || e.name || '',
        Type: e.label || e.tier || e.type || 'Other',
        'Relevance Score': Math.round((e.relevance_score ?? 0) / 10),
        Status: missingNames.has(e.entity || e.name) ? 'Missing' : 'Found',
        Importance: e.importance || '',
      })
    })
  } else if (c3.missing_entities && c3.missing_entities.length > 0) {
    c3.missing_entities.forEach((e: any) => {
      entities.push({
        Entity: e.name || '',
        Type: e.type || 'Other',
        'Relevance Score': e.importance === 'Critical' ? 10 : 5,
        Status: 'Missing',
        Importance: e.importance || '',
      })
    })
  }
  
  return entities
}

function transformActionableInsights(modules: any) {
  const c8 = modules?.page_actions
  if (!c8?.actions) return []
  return c8.actions.map((a: any) => ({
    Type: a.action_type || '',
    Description: a.action || '',
    Priority: a.priority || '',
    'AIVS Dimension': a.aivs_dimension || '',
    'Dimension Weight': a.dimension_weight ?? 0,
    Category: a.category || '',
    'Competitor Has It': a.competitor_has_it ? 'Yes' : 'No',
  }))
}

function transformLlmSimulator(modules: any) {
  const c7 = modules?.llm_simulator
  if (!c7?.model_responses) return []
  return Object.keys(c7.model_responses).map((model: string) => ({
    Model: model,
    'Accuracy Score': c7.accuracy?.per_model?.[model] ?? 0,
    'Completeness Score': c7.completeness?.per_model?.[model] ?? 0,
    'Consistency Overall': c7.consistency?.overall ?? 0,
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
    color: 'text-violet-600',
    dataKey: 'aeo_checker',
  },
  {
    id: 'answerability',
    label: 'Answerability',
    description: 'Completeness, depth, breadth and readability scores.',
    icon: BookOpen,
    color: 'text-blue-600',
    dataKey: 'answer_completeness',
  },
  {
    id: 'knowledge-base',
    label: 'Knowledge Base & Entities',
    description: 'Entity coverage, found/missing entities and gap analysis.',
    icon: Layers,
    color: 'text-emerald-600',
    dataKey: 'entity_coverage',
  },
  {
    id: 'llm-simulator',
    label: 'LLM Simulator',
    description: 'Simulated AI model responses with accuracy and completeness scores.',
    icon: Cpu,
    color: 'text-amber-600',
    dataKey: 'llm_simulator',
  },
  {
    id: 'actionable-insights',
    label: 'Actionable Insights',
    description: 'Improvement actions with priority, impact and category.',
    icon: Zap,
    color: 'text-rose-600',
    dataKey: 'page_actions',
  },
  {
    id: 'all',
    label: 'Full AI Intelligence (All Sheets)',
    description: 'All AI intelligence analysis in one Excel workbook.',
    icon: FileSpreadsheet,
    color: 'text-indigo-600',
    dataKey: '',
  },
]

export default function ModuleCExport({ jobId, sessionName = 'session' }: ModuleCExportProps) {
  const [expanded, setExpanded] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data: moduleCData, isLoading } = useGetModuleCResultQuery({ jobId: jobId ?? '' }, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const modules = moduleCData?.data?.modules

  const getCount = (key: string): number => {
    if (!modules) return 0
    if (key === 'page_actions') return (modules as any).page_actions?.actions?.length ?? 0
    if (key === 'llm_simulator') return Object.keys((modules as any).llm_simulator?.model_responses ?? {}).length
    if (key === 'entity_coverage') {
      const c3 = (modules as any).entity_coverage
      const len = (c3?.entity_relevance?.length || c3?.missing_entities?.length || 0)
      return len + 1
    }
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
    <div className="rounded-2xl border border-(--nd-border) bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-(--nd-bg) transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-(--nd-text-primary)">AI Intelligence (Module C)</p>
            <p className="text-[11px] text-(--nd-text-muted) mt-0.5">
              AI presence, answerability, knowledge base, LLM simulator, actionable insights
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!hasData && !isLoading && (
            <Badge className="bg-(--nd-bg) text-(--nd-text-muted) border-(--nd-border) text-[10px]">No data</Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-(--nd-text-muted)" />
          ) : (
            <ChevronDown className="h-4 w-4 text-(--nd-text-muted)" />
          )}
        </div>
      </button>

      {/* Export options */}
      {expanded && (
        <div className="border-t border-(--nd-border) divide-y divide-(--nd-border)">
          {EXPORT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const count = getCount(opt.dataKey)
            const isDownloading = downloading === opt.id
            const disabled = isLoading || !hasData || !!downloading

            return (
              <div
                key={opt.id}
                className={`flex items-center justify-between px-5 py-3.5 gap-4 ${
                  opt.id === 'all' ? 'bg-(--nd-bg)' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${opt.color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-(--nd-text-primary)">{opt.label}</p>
                    <p className="text-[11px] text-(--nd-text-muted) truncate">{opt.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-(--nd-text-muted)">
                    {opt.id === 'all' ? '5 sheets' : `${count.toLocaleString()} rows`}
                  </span>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => handleDownload(opt.id)}
                    className={`h-8 px-3 text-xs rounded-xl cursor-pointer ${
                      opt.id === 'all'
                        ? 'text-white border-transparent hover:opacity-90'
                        : 'bg-white text-(--nd-text-secondary) border border-(--nd-border) hover:bg-(--nd-bg)'
                    }`}
                    style={opt.id === 'all' ? { background: 'var(--nd-purple)' } : undefined}
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
