'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
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

export function SiteStructure({ sessionId, pages, startUrl, jobId }: SiteStructureProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
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

  const containerSize = useMemo(() => ({
    width: containerRef.current?.clientWidth || 1200,
    height: containerRef.current?.clientHeight || 700
  }), [containerRef.current])

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
              Compact
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/20 text-white hover:bg-white/10"
              onClick={() => { setSiblingSeparation(1.0); setNonSiblingSeparation(1.3); setLabelMaxChars(50); }}
              title="Balanced spacing - Good for 100-500 nodes"
            >
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
              Table Only
            </Button>

            <Button
              size="sm"
              variant={seoEnabled ? 'default' : 'outline'}
              className={seoEnabled
                ? 'bg-purple-500 text-white hover:bg-purple-600'
                : 'bg-white/5 border-white/20 text-white hover:bg-white/10'}
              onClick={() => setSeoEnabled(prev => !prev)}
            >
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
            ref={containerRef}
            className="flex-1 rounded-lg border border-white/20 overflow-hidden relative bg-[#151515]"
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
            className={`${viewMode === 'table' ? 'flex-1' : 'w-full md:w-104 lg:w-120'} max-h-140 overflow-y-auto rounded-2xl border border-white/10 bg-[#151515] p-5 flex flex-col gap-4 text-xs text-white/80 shadow-[0_18px_45px_rgba(15,23,42,0.9)]`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="inline-flex items-center rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-fuchsia-300">
                  <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_0_4px_rgba(244,114,182,0.35)]" />
                  AI Keywords
                </div>
                <div className="mt-1 text-sm font-semibold text-white leading-tight">
                  AI Keywords & Scores
                </div>
              </div>
              {hasKeywordStats && (
                <div className="hidden md:flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-[10px] text-white/70 border border-white/10">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Optimized for this URL</span>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Selected URL</div>
              {selectedUrl ? (
                <a
                  href={selectedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-sky-300 hover:text-sky-200 break-all"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-500/20 text-[9px] text-sky-200">
                    ↗
                  </span>
                  <span className="truncate">{selectedUrl}</span>
                </a>
              ) : (
                <div className="text-[11px] text-white/50">Select a node in the tree</div>
              )}
            </div>
            <div className="space-y-2">
              <div className="rounded-xl bg-linear-to-r from-slate-800 via-slate-900 to-slate-950 border border-white/10 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                  Main Topic
                </div>
                <div className="mt-1 text-sm md:text-base font-semibold text-white truncate">
                  {selectedSeo?.parentText || 'Not available yet'}
                </div>
              </div>
              {selectedKeywords.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                  <div className="rounded-xl bg-linear-to-br from-rose-900/80 via-rose-900/60 to-rose-900/40 border border-rose-500/60 px-4 py-3">
                    <div className="flex items-center justify-between text-[10px] text-rose-100/70">
                      <span>Avg Difficulty</span>
                    </div>
                    <div className="mt-1 text-xl font-semibold text-rose-50 leading-none">
                      {avgDifficulty != null ? Math.round(avgDifficulty) : '--'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-rose-100/70">
                      out of 100
                    </div>
                  </div>
                  <div className="rounded-xl bg-linear-to-br from-amber-900/80 via-amber-900/60 to-amber-900/40 border border-amber-500/60 px-4 py-3">
                    <div className="flex items-center justify-between text-[10px] text-amber-100/70">
                      <span>Complexity</span>
                    </div>
                    <div className="mt-1 text-xl font-semibold text-amber-50 leading-none">
                      {complexityStats.main || '--'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-amber-100/70">
                      L {complexityStats.low} • M {complexityStats.medium} • H {complexityStats.high}
                    </div>
                  </div>
                  <div className="rounded-xl bg-linear-to-br from-emerald-900/80 via-emerald-900/60 to-emerald-900/40 border border-emerald-500/60 px-4 py-3">
                    <div className="flex items-center justify-between text-[10px] text-emerald-100/70">
                      <span>AI Feasibility</span>
                    </div>
                    <div className="mt-1 text-xl font-semibold text-emerald-50 leading-none">
                      {avgFeasibility != null ? `${Math.round(avgFeasibility)}%` : '--'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-emerald-100/70">
                      generation score
                    </div>
                  </div>
                </div>
              )}
            </div>
            {selectedKeywords.length > 0 && (
              <>
                <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-950/60">
                  <div className="overflow-x-auto">
                    <div className="min-w-180">
                      <div className="px-3 py-2 bg-white/5 text-[10px] font-semibold text-white/60 flex">
                        <div className="flex-1">Keyword</div>
                        <div className="w-12 text-right">Score</div>
                        <div className="w-14 text-right">Prompts</div>
                        <div className="w-16 text-right">Relevance</div>
                        <div className="w-16 text-right">Diversity</div>
                        <div className="w-16 text-right">Difficulty</div>
                        <div className="w-20 text-right">Complexity</div>
                        <div className="w-24 text-right">AI Feasibility</div>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-white/10">
                        {selectedKeywords.map((kw: any) => (
                          <div
                            key={kw.text}
                            className="px-3 py-1.5 flex items-center text-[11px] text-white/80 hover:bg-white/5 transition-colors"
                          >
                            <div className="flex-2 min-w-35 pr-3 whitespace-nowrap">
                              {kw.text}
                            </div>
                            <div className="w-12 text-right">
                              {kw.score != null ? Number(kw.score).toFixed(2) : '-'}
                            </div>
                            <div className="w-14 text-right">
                              {kw.prompt_count != null ? kw.prompt_count : '-'}
                            </div>
                            <div className="w-16 text-right">
                              {kw.relevance_score != null ? `${Math.round(kw.relevance_score)}%` : '-'}
                            </div>
                            <div className="w-16 text-right">
                              {kw.diversity_score != null ? `${Math.round(kw.diversity_score)}%` : '-'}
                            </div>
                            <div className="w-16 text-right">
                              {kw.difficulty_score != null ? Math.round(kw.difficulty_score) : '-'}
                            </div>
                            <div className="w-20 text-right">
                              {kw.complexity_level || '-'}
                            </div>
                            <div className="w-24 text-right">
                              {kw.ai_generation_feasibility != null ? `${Math.round(kw.ai_generation_feasibility)}%` : '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            {selectedKeywords.length === 0 && (
              <div className="mt-1 rounded-xl border border-dashed border-white/15 bg-slate-950/40 px-3 py-3 text-[11px] text-white/55">
                AI keywords are still being extracted for this URL.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
