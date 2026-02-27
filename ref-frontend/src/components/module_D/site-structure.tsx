'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Brain, 
  Target, 
  TrendingUp, 
  TrendingDown,
  Layers, 
  Zap, 
  CheckCircle, 
  XCircle, 
  ArrowUpRight, 
  Globe,
  Maximize2,
  Table,
  Split,
  Search
} from 'lucide-react'
import { cn } from '@/lib/utils'
import D3TidyTree, { TreeNode as TidyTreeNode } from './D3TidyTree'
import { useGetJobFieldsQuery, useGetSeoKeywordsForUrlMutation } from '@/store/api/jobApi'

export type D3TreeNode = {
  name: string
  attributes?: Record<string, string | number | boolean>
  children?: D3TreeNode[]
}

interface SiteStructureProps {
  sessionId?: string | number | null
  pages?: Array<{ url?: string | null }>
  startUrl?: string | null
  jobId?: string | null
}

type KeywordData = {
  text: string
  score: number
  prompt_count: number
  relevance_score: number
  diversity_score: number
  difficulty_score?: number
  complexity_level?: 'Low' | 'Medium' | 'High'
  ai_generation_feasibility?: number
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    u.host = u.host.toLowerCase()
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    return u.toString()
  } catch {
    return url
  }
}

function isLikelyPageUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const pathname = u.pathname.toLowerCase()
    const lastSeg = pathname.split('/').pop() || ''
    const hasDot = lastSeg.includes('.')
    if (!hasDot) return true
    const ext = lastSeg.split('.').pop() || ''
    const nonPageExts = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tif', 'tiff',
      'css', 'js', 'mjs', 'cjs', 'map',
      'woff', 'woff2', 'ttf', 'otf', 'eot',
      'pdf', 'zip', 'rar', '7z', 'gz', 'tar', 'bz2', 'xz',
      'mp3', 'mp4', 'webm', 'ogg', 'wav', 'mov', 'avi', 'mkv',
      'json', 'rss', 'atom', 'yaml', 'yml',
      'xml'
    ])
    if (nonPageExts.has(ext)) return false
    const pageExts = new Set(['html', 'htm', 'php', 'asp', 'aspx', 'jsp', 'cfm', 'xhtml'])
    if (pageExts.has(ext)) return true
    return true
  } catch {
    return true
  }
}

function collectAllUrls(node: D3TreeNode | null): string[] {
  if (!node) return []
  const acc: string[] = []
  const stack: D3TreeNode[] = [node]
  while (stack.length) {
    const n = stack.pop()!
    const full = (n.attributes?.full as string) || n.name
    acc.push(normalizeUrl(full))
    if (n.children) for (const c of n.children) stack.push(c)
  }
  return Array.from(new Set(acc))
}

function computeTreeStats(root: D3TreeNode | null): { maxDepth: number; levelCounts: number[] } {
  if (!root) return { maxDepth: 0, levelCounts: [] }
  const levelCounts: number[] = []
  const stack: Array<{ node: D3TreeNode; level: number }> = [{ node: root, level: 0 }]
  let maxDepth = 0
  while (stack.length) {
    const { node, level } = stack.pop()!
    maxDepth = Math.max(maxDepth, level)
    levelCounts[level] = (levelCounts[level] || 0) + 1
    if (node.children) for (const c of node.children) stack.push({ node: c, level: level + 1 })
  }
  return { maxDepth, levelCounts }
}

function autoAdjustLayout(root: D3TreeNode | null, setSiblingSeparation: (v: number) => void, setNonSiblingSeparation: (v: number) => void, setLabelMaxChars: (v: number) => void) {
  const { maxDepth, levelCounts } = computeTreeStats(root)
  const breadth = Math.max(...(levelCounts.length ? levelCounts : [1]))
  const sib = Math.min(3, Math.max(0.9, 1 + (breadth / 300)))
  const nonSib = Math.min(4, Math.max(1.0, 1.2 + (maxDepth / 8)))
  setSiblingSeparation(Number(sib.toFixed(2)))
  setNonSiblingSeparation(Number(nonSib.toFixed(2)))
  const maxChars = breadth > 200 ? 30 : breadth > 100 ? 40 : 60
  setLabelMaxChars(maxChars)
}

function convertToTidy(root: D3TreeNode | null, seoByUrl: Map<string, any>, seoEnabled: boolean): TidyTreeNode | null {
  if (!root) return null
  const mapNode = (n: D3TreeNode): TidyTreeNode => {
    const full = (n.attributes?.full as string) || n.name
    const label = (n.attributes?.full as string) || n.name
    const baseChildren: TidyTreeNode[] = n.children && n.children.length ? n.children.map(mapNode) : []
    return {
      text: label,
      attributes: { full },
      children: baseChildren.length ? baseChildren : undefined,
    }
  }
  return mapNode(root)
}

function calculateContentMetrics(keyword: KeywordData): {
  difficulty_score: number
  complexity_level: 'Low' | 'Medium' | 'High'
  ai_generation_feasibility: number
} {
  const score = Math.min(1, Math.max(0, (keyword.score || 0) / 10))
  const relevance = Math.min(1, Math.max(0, (keyword.relevance_score || 0) / 100))
  const diversity = Math.min(1, Math.max(0, (keyword.diversity_score || 0) / 100))
  const promptCount = keyword.prompt_count || 0
  const wordCount = keyword.text.split(/\s+/).length
  let difficultyScore = 0
  difficultyScore += (1 - score) * 40
  difficultyScore += relevance * 25
  difficultyScore += diversity * 20
  difficultyScore += Math.min(promptCount / 20, 1) * 10
  if (wordCount === 1 && score < 0.5) {
    difficultyScore += 5
  }
  difficultyScore = Math.min(100, Math.max(0, difficultyScore))
  let complexityLevel: 'Low' | 'Medium' | 'High' = 'Low'
  if (wordCount === 1) {
    complexityLevel = 'Low'
  } else if (wordCount === 2) {
    complexityLevel = diversity > 0.5 ? 'Medium' : 'Low'
  } else if (wordCount === 3) {
    complexityLevel = diversity > 0.6 ? 'High' : 'Medium'
  } else {
    complexityLevel = diversity > 0.5 ? 'High' : 'Medium'
  }
  let aiFeasibility = 0
  aiFeasibility += score * 35
  aiFeasibility += relevance * 30
  aiFeasibility += (1 - diversity) * 20
  if (promptCount > 0) {
    aiFeasibility += Math.min(promptCount / 10, 1) * 10
  }
  if (wordCount <= 3) {
    aiFeasibility += 5
  }
  aiFeasibility = Math.min(100, Math.max(0, aiFeasibility))
  return {
    difficulty_score: Math.round(difficultyScore),
    complexity_level: complexityLevel,
    ai_generation_feasibility: Math.round(aiFeasibility)
  }
}

// Score Card Component
interface ScoreCardProps {
  title: string
  score: number | string | null
  icon: React.ReactNode
  color: string
  subText?: string
  trend?: number
  className?: string
}

function ScoreCard({ title, score, icon, color, subText, trend, className }: ScoreCardProps) {
  const getScoreLabel = (s: number) => {
    if (s >= 80) return { text: 'Excellent', color: 'text-green-400 bg-green-500/10' }
    if (s >= 60) return { text: 'Good', color: 'text-yellow-400 bg-yellow-500/10' }
    if (s >= 40) return { text: 'Fair', color: 'text-orange-400 bg-orange-500/10' }
    return { text: 'Needs Work', color: 'text-red-400 bg-red-500/10' }
  }

  const numericScore = typeof score === 'number' ? score : parseFloat(score as string)
  const showBadge = !isNaN(numericScore) && score !== null

  return (
    <div className={cn("bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:bg-white/5 transition-all duration-300 group flex flex-col justify-between", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-xl", color)}>
            {icon}
          </div>
          <span className="text-sm font-medium text-white/80">{title}</span>
        </div>
        {showBadge && (
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-medium border border-white/5",
            getScoreLabel(numericScore).color
          )}>
            {getScoreLabel(numericScore).text}
          </span>
        )}
      </div>
      <div>
        <div className="flex items-baseline gap-1">
          <div className="text-3xl font-bold text-white">{score ?? '--'}</div>
          {typeof score === 'number' && <span className="text-sm text-white/40">/100</span>}
        </div>
        
        <div className="flex items-center justify-between mt-2">
           {subText && <div className="text-[11px] text-white/40">{subText}</div>}
           {trend !== undefined && (
              <div className={cn(
                "flex items-center gap-1 text-[10px] font-medium",
                trend >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>{trend >= 0 ? '+' : ''}{trend}%</span>
              </div>
           )}
        </div>
      </div>
    </div>
  )
}

export function SiteStructure({ sessionId, pages, startUrl, jobId }: SiteStructureProps) {
  const observerRef = useRef<ResizeObserver | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 1200, height: 700 })
  const [rootUrl, setRootUrl] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [treeData, setTreeData] = useState<D3TreeNode | null>(null)
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('horizontal')
  const [siblingSeparation, setSiblingSeparation] = useState<number>(0.8)
  const [nonSiblingSeparation, setNonSiblingSeparation] = useState<number>(1.0)
  const [labelMaxChars, setLabelMaxChars] = useState<number>(40)
  const [primaryHost, setPrimaryHost] = useState<string | null>(null)
  const [totalUrlsUsed, setTotalUrlsUsed] = useState<number>(0)
  const [breadcrumb, setBreadcrumb] = useState<string[]>([])
  const [recenterKey, setRecenterKey] = useState<number>(0)

  const hasPages = !!pages && pages.length > 0

  // SEO state
  const [seoEnabled, setSeoEnabled] = useState<boolean>(true)
  const [seoLoading, setSeoLoading] = useState<boolean>(false)
  const [seoBatchLoading, setSeoBatchLoading] = useState<boolean>(false)
  const [seoProgress, setSeoProgress] = useState<{ current: number; total: number; estimatedTimeRemaining?: number } | null>(null)
  const [seoError, setSeoError] = useState<string | null>(null)
  const [seoResult] = useState<null | any>(null)
  const [seoByUrl, setSeoByUrl] = useState<Map<string, any>>(new Map())

  const [fetchSeoKeywords] = useGetSeoKeywordsForUrlMutation()

  const { data: fieldsResult, isLoading: isLoadingFields, isError: isFieldsError } =
    useGetJobFieldsQuery(jobId!, { skip: !jobId || !seoEnabled })

  useEffect(() => {
    setSeoBatchLoading(seoEnabled && isLoadingFields)
  }, [seoEnabled, isLoadingFields])

  useEffect(() => {
    if (!seoEnabled) return
    if (!fieldsResult || !Array.isArray(fieldsResult.data)) return

    const map = new Map<string, any>()

    for (const doc of fieldsResult.data) {
      const url = doc?.url as string | undefined
      const keywordAnalysis = doc?.Keyword_analysis
      if (!url || !keywordAnalysis || !Array.isArray(keywordAnalysis.keywords)) continue

      const topKeywords: KeywordData[] = (keywordAnalysis.keywords as any[]).map((k: any) => {
        const base: KeywordData = {
          text: k.text,
          score: k.score,
          prompt_count: k.prompt_count,
          relevance_score: k.relevance_score,
          diversity_score: k.diversity_score
        }
        const metrics = calculateContentMetrics(base)
        return { ...base, ...metrics }
      })

      map.set(normalizeUrl(url), {
        parentText: keywordAnalysis.parent?.text ?? keywordAnalysis.parent ?? null,
        topKeywords
      })
    }

    setSeoByUrl(map)
    setSeoProgress(null)
  }, [fieldsResult, seoEnabled])

  useEffect(() => {
    if (isFieldsError) {
      setSeoError('Failed to load SEO keyword data')
    } else {
      setSeoError(null)
    }
  }, [isFieldsError])

  const computeSelectedUrl = useCallback((): string | null => {
    if (!breadcrumb || breadcrumb.length === 0) return null

    for (let i = breadcrumb.length - 1; i >= 0; i--) {
      const candidate = breadcrumb[i]
      if (!candidate) continue
      try {
        const u = new URL(candidate)
        return normalizeUrl(u.toString())
      } catch {
        continue
      }
    }

    const first = breadcrumb[0]
    if (!first) return null
    try {
      const base = new URL(first)
      if (breadcrumb.length === 1) return normalizeUrl(base.toString())
      const suffix = breadcrumb.slice(1).join('/')
      const joined = suffix ? `${base.origin}${base.pathname.replace(/\/$/, '')}/${suffix}` : base.toString()
      return normalizeUrl(joined)
    } catch {
      return null
    }
  }, [breadcrumb])

  const selectedUrl = computeSelectedUrl()
  const selectedSeo = selectedUrl ? seoByUrl.get(selectedUrl) as any : null
  const selectedKeywords: any[] = selectedSeo?.topKeywords || []
  const hasKeywordStats = selectedKeywords.length > 0
  const avgScore = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.score) || 0), 0) / selectedKeywords.length
    : 0
  const avgRelevance = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.relevance_score) || 0), 0) / selectedKeywords.length
    : null
  const avgDiversity = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.diversity_score) || 0), 0) / selectedKeywords.length
    : null
  const avgDifficulty = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.difficulty_score) || 0), 0) / selectedKeywords.length
    : null
  const avgFeasibility = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.ai_generation_feasibility) || 0), 0) / selectedKeywords.length
    : null

  const complexityStats = useMemo(() => {
    if (!hasKeywordStats) {
      return { main: null as 'Low' | 'Medium' | 'High' | null, low: 0, medium: 0, high: 0 }
    }
    let low = 0
    let medium = 0
    let high = 0
    for (const kw of selectedKeywords) {
      const level = kw.complexity_level as 'Low' | 'Medium' | 'High' | undefined
      if (level === 'High') high += 1
      else if (level === 'Medium') medium += 1
      else if (level === 'Low') low += 1
    }
    const maxCount = Math.max(low, medium, high)
    let main: 'Low' | 'Medium' | 'High' | null = null
    if (maxCount > 0) {
      if (maxCount === high) main = 'High'
      else if (maxCount === medium) main = 'Medium'
      else main = 'Low'
    }
    return { main, low, medium, high }
  }, [hasKeywordStats, selectedKeywords])

  const [viewMode, setViewMode] = useState<'split' | 'tree' | 'table'>('split')

  useEffect(() => {
    if (!seoEnabled) return
    if (!selectedUrl) return
    if (!jobId) return
    if (seoByUrl.has(selectedUrl)) return

    let cancelled = false

    const fetchSeoForSelected = async () => {
      try {
        setSeoLoading(true)
        const data = await fetchSeoKeywords({ jobId: String(jobId), url: selectedUrl }).unwrap()
        if (cancelled || !data) return

        const rawKeywords = Array.isArray(data.keywords) ? (data.keywords as any[]) : []

        const topKeywords: KeywordData[] = rawKeywords.map((k: any) => {
          const base: KeywordData = {
            text: k.text,
            score: k.score,
            prompt_count: k.prompt_count,
            relevance_score: k.relevance_score,
            diversity_score: k.diversity_score
          }
          const metrics: Partial<KeywordData> = {
            difficulty_score: k.difficulty_score,
            complexity_level: k.complexity_level,
            ai_generation_feasibility: k.ai_generation_feasibility
          }
          const computed = calculateContentMetrics(base)
          return {
            ...base,
            difficulty_score: metrics.difficulty_score ?? computed.difficulty_score,
            complexity_level: metrics.complexity_level ?? computed.complexity_level,
            ai_generation_feasibility: metrics.ai_generation_feasibility ?? computed.ai_generation_feasibility
          }
        })

        setSeoByUrl(prev => {
          const next = new Map(prev)
          const key = normalizeUrl((data as any).url || selectedUrl)
          next.set(key, {
            parentText: (data as any).parent?.text ?? (data as any).parent ?? null,
            topKeywords
          })
          return next
        })
      } catch {
      } finally {
        if (!cancelled) {
          setSeoLoading(false)
        }
      }
    }

    fetchSeoForSelected()

    return () => {
      cancelled = true
    }
  }, [seoEnabled, selectedUrl, jobId, seoByUrl, fetchSeoKeywords])

  useEffect(() => {
    if (startUrl) {
      setRootUrl(normalizeUrl(startUrl))
    }
  }, [startUrl])

  function formatSeconds(totalSeconds?: number): string {
    if (totalSeconds == null || !isFinite(totalSeconds)) return '--:--';
    const s = Math.max(0, Math.round(totalSeconds));
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  const buildTreeFn = useCallback(async () => {
    if (!pages || pages.length === 0) {
      setError('No URLs found for this session')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const urls: string[] = []

      for (const it of pages) {
        const u = it?.url
        if (!u) continue
        const nu = normalizeUrl(u)
        if (!isLikelyPageUrl(nu)) continue
        urls.push(nu)
      }

      const uniqueUrls = Array.from(new Set(urls))
      if (uniqueUrls.length === 0) throw new Error('No URLs found for this session')

      const sessionStart = rootUrl || uniqueUrls[0]
      const normalizedRoot = normalizeUrl(sessionStart)
      const root = new URL(normalizedRoot)
      setRootUrl(normalizedRoot)
      setPrimaryHost(root.host)

      const rootNode: D3TreeNode = { name: normalizedRoot, attributes: { level: 0, full: normalizedRoot }, children: [] }

      const ensureChild = (parent: D3TreeNode, name: string, level: number, full: string): D3TreeNode => {
        if (!parent.children) parent.children = []
        let child = parent.children.find(c => c.name === name)
        if (!child) {
          child = { name, attributes: { level, full }, children: [] }
          parent.children.push(child)
        }
        return child
      }

      let usedCount = 0
      for (const u of uniqueUrls) {
        let parsed: URL
        try { parsed = new URL(u); } catch { continue }
        if (parsed.host !== root.host && !parsed.hostname.endsWith('.' + root.hostname)) continue
        const segments = parsed.pathname.split('/').filter(Boolean)
        let current = rootNode
        let currentFull = `${root.protocol}//${root.host}`
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i]
          currentFull += `/${seg}`
          current = ensureChild(current, seg, ((current.attributes?.level as number) ?? 0) + 1, currentFull)
        }
        usedCount++
      }

      rootNode.attributes = { ...(rootNode.attributes || {}), full: normalizedRoot }
      setTreeData(rootNode)
      autoAdjustLayout(rootNode, setSiblingSeparation, setNonSiblingSeparation, setLabelMaxChars)
      setTotalUrlsUsed(usedCount)
      try { setBreadcrumb([normalizedRoot]); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build tree')
    } finally {
      setLoading(false)
    }
  }, [pages, rootUrl])

  const handleBuild = useCallback(() => { buildTreeFn() }, [buildTreeFn])

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (node) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          })
        }
      })
      observer.observe(node)
      observerRef.current = observer
      
      setContainerSize({
        width: node.clientWidth,
        height: node.clientHeight
      })
    }
  }, [])

  const [seoUpdateKey, setSeoUpdateKey] = useState(0)
  useEffect(() => { setSeoUpdateKey(prev => prev + 1) }, [seoByUrl, seoEnabled])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg sm:text-xl font-semibold text-white">Site Structure</h3>
          {primaryHost && (
            <span className="px-2 py-1 rounded-full bg-white/10 border border-white/20 text-xs sm:text-sm text-white/80">
              Root: {primaryHost}
            </span>
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          {!sessionId && (
            <div className="text-yellow-300 text-sm">
              No session selected. Tree will be available when a session is active.
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/20 text-white hover:bg-white/10"
              onClick={() => { setSiblingSeparation(0.6); setNonSiblingSeparation(0.8); setLabelMaxChars(30); }}
              title="Ultra compact - Best for 1000+ nodes"
            >
              <Maximize2 className="w-3 h-3 mr-1.5" />
              Compact
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/20 text-white hover:bg-white/10"
              onClick={() => { setSiblingSeparation(1.0); setNonSiblingSeparation(1.3); setLabelMaxChars(50); }}
              title="Balanced spacing - Good for 100-500 nodes"
            >
              <Maximize2 className="w-3 h-3 mr-1.5 rotate-90" />
              Comfortable
            </Button>
          </div>
          {seoEnabled && (seoLoading || seoBatchLoading) && (
            <span className="px-2 py-1 bg-yellow-900 text-yellow-300 rounded text-sm flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-yellow-300 border-t-transparent rounded-full animate-spin"></span>
              {seoBatchLoading && seoProgress ? (
                <>
                  <span>Extracting {seoProgress.current}/{seoProgress.total}</span>
                  <span className="opacity-80">ETA {formatSeconds(seoProgress.estimatedTimeRemaining)}</span>
                </>
              ) : (
                <span>Extracting…</span>
              )}
            </span>
          )}
          {seoEnabled && seoError && (
            <span className="px-2 py-1 bg-red-900 text-red-300 rounded text-sm">
              {seoError}
            </span>
          )}

          <Button
            size="sm"
            className="bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30 disabled:opacity-50"
            onClick={handleBuild}
            disabled={!sessionId || !hasPages || loading}
          >
            {loading ? 'Building…' : 'Build Tree'}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={viewMode === 'split' ? 'default' : 'outline'}
              className={viewMode === 'split'
                ? 'bg-white text-black'
                : 'bg-white/5 border-white/20 text-white hover:bg-white/10'}
              onClick={() => setViewMode('split')}
            >
              <Split className="w-3 h-3 mr-1.5" />
              Split View
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'tree' ? 'default' : 'outline'}
              className={viewMode === 'tree'
                ? 'bg-white text-black'
                : 'bg-white/5 border-white/20 text-white hover:bg-white/10'}
              onClick={() => setViewMode('tree')}
            >
              <Layers className="w-3 h-3 mr-1.5" />
              Tree Only
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'table' ? 'default' : 'outline'}
              className={viewMode === 'table'
                ? 'bg-white text-black'
                : 'bg-white/5 border-white/20 text-white hover:bg-white/10'}
              onClick={() => setViewMode('table')}
              disabled={!seoEnabled}
            >
              <Table className="w-3 h-3 mr-1.5" />
              Table Only
            </Button>

            <Button
              size="sm"
              variant={seoEnabled ? 'default' : 'outline'}
              className={seoEnabled
                ? 'bg-purple-500 text-white hover:bg-purple-600 shadow-lg shadow-purple-500/20'
                : 'bg-white/5 border-white/20 text-white hover:bg-white/10'}
              onClick={() => setSeoEnabled(prev => !prev)}
            >
              <Brain className="w-3 h-3 mr-1.5" />
              AI Keywords
            </Button>
          </div>

          {error && <span className="text-red-400 text-sm">{error}</span>}
        </div>
      </div>

      {breadcrumb.length > 0 && (
        <div className="mb-3 text-sm text-white/70">
          <span className="font-medium">Path:</span>{' '}
          <span className="break-all">{breadcrumb.join(' › ')}</span>
        </div>
      )}

      <div className="flex-1 flex gap-4 min-h-0">
        {(viewMode === 'split' || viewMode === 'tree') && (
          <div
            ref={setContainerRef}
            className="flex-1 rounded-2xl border border-white/10 overflow-hidden relative bg-white/5 backdrop-blur-xl"
          >
            {(() => {
              const isSeoBusy = seoEnabled && (seoLoading || seoBatchLoading)
              if (!treeData) {
                return (
                  <div className="flex items-center justify-center h-full text-white/60">
                    {loading ? 'Building tree structure...' : 'Configure options and click "Build Tree".'}
                  </div>
                )
              }
              if (isSeoBusy) {
                return null
              }
              return (
                <D3TidyTree
                  data={convertToTidy(treeData, seoByUrl, seoEnabled)!}
                  height={containerSize.height}
                  orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
                  dx={siblingSeparation * 80}
                  dy={nonSiblingSeparation * 320}
                  onSelectPath={setBreadcrumb}
                  recenterKey={recenterKey + seoUpdateKey}
                  initialExpandDepth={0}
                />
              )
            })()}
            {(seoEnabled && (seoLoading || seoBatchLoading)) && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[1px] flex items-center justify-center z-10">
                <div className="flex items-center gap-3 text-yellow-200">
                  <span className="inline-block w-6 h-6 border-4 border-yellow-300 border-t-transparent rounded-full animate-spin"></span>
                  {seoBatchLoading && seoProgress ? (
                    <div className="text-sm">
                      <div className="font-semibold">Extracting keywords…</div>
                      <div className="opacity-90">{seoProgress.current}/{seoProgress.total} • ETA {formatSeconds(seoProgress.estimatedTimeRemaining)}</div>
                    </div>
                  ) : (
                    <div className="text-sm font-semibold">Extracting keywords…</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {seoEnabled && (viewMode === 'split' || viewMode === 'table') && (
          <div
            className={`${viewMode === 'table' ? 'flex-1' : 'w-full md:w-104 lg:w-120'} h-full overflow-y-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 flex flex-col gap-5 text-xs text-white/80 shadow-[0_18px_45px_rgba(15,23,42,0.9)]`}
          >
            {/* Header Section */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-fuchsia-500/20">
                  <Brain className="w-5 h-5 text-fuchsia-400" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">
                    AI Keywords
                  </div>
                  <div className="text-sm font-semibold text-white leading-tight">
                    Analysis & Scores
                  </div>
                </div>
              </div>
              
              {hasKeywordStats && (
                <div className="hidden md:flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] text-emerald-300 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Optimized</span>
                </div>
              )}
            </div>

            {/* Selected URL Section */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2 flex items-center gap-2">
                <Globe className="w-3 h-3" />
                Selected URL
              </div>
              {selectedUrl ? (
                <a
                  href={selectedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 text-[11px] text-sky-300 hover:text-sky-200 break-all transition-colors"
                >
                  <div className="p-1 rounded-md bg-sky-500/20 text-sky-300 group-hover:bg-sky-500/30 transition-colors">
                    <ArrowUpRight className="w-3 h-3" />
                  </div>
                  <span className="truncate">{selectedUrl}</span>
                </a>
              ) : (
                <div className="text-[11px] text-white/50 italic">Select a node in the tree to view details</div>
              )}
            </div>

            {/* Main Topic & Scores */}
            <div className="space-y-3">
               {/* Main Topic */}
               <div className="bg-linear-to-r from-slate-800 to-slate-900 rounded-2xl p-5 border border-white/10 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-3 opacity-10">
                   <Target className="w-16 h-16 text-white" />
                 </div>
                 <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Main Topic</div>
                 <div className="text-lg font-bold text-white relative z-10">
                   {selectedSeo?.parentText || 'Not available'}
                 </div>
               </div>

               {selectedKeywords.length > 0 && (
                 <div className="grid grid-cols-1 gap-3">
                   <div className="grid grid-cols-2 gap-3">
                      <ScoreCard 
                        title="Difficulty"
                        score={avgDifficulty != null ? Math.round(avgDifficulty) : '--'}
                        subText="SEO Competition"
                        icon={<TrendingUp className="w-5 h-5 text-rose-300" />}
                        color="bg-rose-500/20"
                        trend={avgDifficulty && avgDifficulty > 50 ? 12 : -5}
                      />
                      <ScoreCard 
                        title="Feasibility"
                        score={avgFeasibility != null ? Math.round(avgFeasibility) : '--'}
                        subText="AI Generation"
                        icon={<Zap className="w-5 h-5 text-emerald-300" />}
                        color="bg-emerald-500/20"
                        trend={avgFeasibility && avgFeasibility > 70 ? 8 : 2}
                      />
                   </div>
                   <ScoreCard 
                     title="Complexity"
                     score={complexityStats.main === 'High' ? 85 : complexityStats.main === 'Medium' ? 50 : 25}
                     subText={`Distribution: ${complexityStats.low} Low, ${complexityStats.medium} Med, ${complexityStats.high} High`}
                     icon={<Layers className="w-5 h-5 text-amber-300" />}
                     color="bg-amber-500/20"
                     className="col-span-1"
                   />
                 </div>
               )}
            </div>

            {/* Keywords Table */}
            {selectedKeywords.length > 0 && (
              <div className="flex flex-col shrink-0 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Keyword Analysis</div>
                  <div className="text-[10px] text-white/40">{selectedKeywords.length} keywords</div>
                </div>
                
                <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/5 flex flex-col">
                  <div className="overflow-auto custom-scrollbar">
                     <table className="w-full text-left border-collapse">
                       <thead className="bg-white/5 sticky top-0 z-10 backdrop-blur-md border-b border-white/10">
                         <tr>
                           <th className="px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider">Keyword</th>
                           <th className="px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right">Score</th>
                           <th className="px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right" title="Relevance Score">Rel</th>
                           <th className="px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right" title="Diversity Score">Div</th>
                           <th className="px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right" title="Prompt Count">Prompt</th>
                           <th className="px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right" title="Difficulty">Dif</th>
                           <th className="px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right" title="Feasibility">Feas</th>
                           <th className="px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right" title="Complexity">Cmplx</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-white/5">
                         {selectedKeywords.map((kw: any, idx: number) => (
                           <tr key={idx} className="hover:bg-white/5 transition-all duration-200 group">
                             <td className="px-4 py-3 text-xs text-white/90 font-medium">
                               <div className="flex items-center gap-2">
                                 <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 group-hover:bg-indigo-400 transition-colors"></div>
                                 <div className="truncate max-w-[120px] sm:max-w-[150px]" title={kw.text}>{kw.text}</div>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <div className="flex flex-col items-end gap-1">
                                 <span className="text-xs font-mono text-white/90 font-medium">{kw.score != null ? Number(kw.score).toFixed(1) : '-'}</span>
                                 <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                                   <div 
                                     className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                                     style={{ width: `${Math.min(100, (Number(kw.score) || 0) * 10)}%` }}
                                   />
                                 </div>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <div className="flex flex-col items-end gap-1">
                                 <span className="text-xs font-mono text-white/70">{kw.relevance_score != null ? Number(kw.relevance_score).toFixed(1) : '-'}</span>
                                 <div className="w-8 h-0.5 bg-white/10 rounded-full overflow-hidden">
                                   <div 
                                     className="h-full bg-blue-400/70 rounded-full"
                                     style={{ width: `${Math.min(100, (Number(kw.relevance_score) || 0))}%` }}
                                   />
                                 </div>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <div className="flex flex-col items-end gap-1">
                                 <span className="text-xs font-mono text-white/70">{kw.diversity_score != null ? Number(kw.diversity_score).toFixed(1) : '-'}</span>
                                 <div className="w-8 h-0.5 bg-white/10 rounded-full overflow-hidden">
                                   <div 
                                     className="h-full bg-teal-400/70 rounded-full"
                                     style={{ width: `${Math.min(100, (Number(kw.diversity_score) || 0))}%` }}
                                   />
                                 </div>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <div className="flex justify-end">
                                 <span className="w-6 h-6 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-[10px] font-mono text-white/70">
                                   {kw.prompt_count ?? '-'}
                                 </span>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <span className={cn(
                                 "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                                 (kw.difficulty_score || 0) > 70 ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                 (kw.difficulty_score || 0) > 40 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                 "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                               )}>
                                 {kw.difficulty_score != null ? Math.round(kw.difficulty_score) : '-'}
                               </span>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <span className={cn(
                                 "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                                 (kw.ai_generation_feasibility || 0) > 70 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                 (kw.ai_generation_feasibility || 0) > 40 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                 "bg-rose-500/10 text-rose-400 border-rose-500/20"
                               )}>
                                 {kw.ai_generation_feasibility != null ? `${Math.round(kw.ai_generation_feasibility)}%` : '-'}
                               </span>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <span className={cn(
                                 "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                                 kw.complexity_level === 'High' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                 kw.complexity_level === 'Medium' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                 kw.complexity_level === 'Low' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                 "bg-white/5 text-white/40 border-white/10"
                               )}>
                                 {kw.complexity_level ?? '-'}
                               </span>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                  </div>
                </div>
              </div>
            )}
            
            {selectedKeywords.length === 0 && (
              <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-8 text-center">
                <div className="flex justify-center mb-3">
                   <div className="p-3 rounded-full bg-white/5">
                     <Search className="w-5 h-5 text-white/30" />
                   </div>
                </div>
                <div className="text-xs text-white/50">
                  AI keywords are still being extracted or none were found for this URL.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
