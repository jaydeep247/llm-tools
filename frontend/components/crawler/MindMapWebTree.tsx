import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import D3TidyTree, { TreeNode as TidyTreeNode } from './D3TidyTree';

type D3TreeNode = {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: D3TreeNode[];
};

type Session = { id: number; startedAt: string; completedAt?: string; totalPages: number; startUrl?: string };

type KeywordData = {
  text: string;
  score: number;
  prompt_count?: number;
  relevance_score?: number;
  diversity_score?: number;
  // New metrics
  difficulty_score?: number; // 0-100
  complexity_level?: 'Low' | 'Medium' | 'High';
  ai_generation_feasibility?: number; // 0-100
};

type SEOData = {
  parentText?: string;
  topKeywords?: KeywordData[];
};

interface MindMapWebTreeProps {
  onClose: () => void;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.host = u.host.toLowerCase();
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function isLikelyPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const pathname = u.pathname.toLowerCase();
    const lastSeg = pathname.split('/').pop() || '';
    const hasDot = lastSeg.includes('.');
    if (!hasDot) return true;
    const ext = lastSeg.split('.').pop() || '';
    const nonPageExts = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tif', 'tiff',
      'css', 'js', 'mjs', 'cjs', 'map',
      'woff', 'woff2', 'ttf', 'otf', 'eot',
      'pdf', 'zip', 'rar', '7z', 'gz', 'tar', 'bz2', 'xz',
      'mp3', 'mp4', 'webm', 'ogg', 'wav', 'mov', 'avi', 'mkv',
      'json', 'rss', 'atom', 'yaml', 'yml', 'xml'
    ]);
    if (nonPageExts.has(ext)) return false;
    const pageExts = new Set(['html', 'htm', 'php', 'asp', 'aspx', 'jsp', 'cfm', 'xhtml']);
    if (pageExts.has(ext)) return true;
    return true;
  } catch {
    return true;
  }
}

/**
 * Calculate content metrics from keyword data
 * Note: Backend scores format:
 *   - score: 0-10 scale
 *   - relevance_score: 0-100 scale
 *   - diversity_score: 0-100 scale
 */
function calculateContentMetrics(keyword: KeywordData): {
  difficulty_score: number;
  complexity_level: 'Low' | 'Medium' | 'High';
  ai_generation_feasibility: number;
} {
  // Normalize scores to 0-1 range for calculations
  const score = Math.min(1, Math.max(0, (keyword.score || 0) / 10));  // 0-10 scale -> 0-1
  const relevance = Math.min(1, Math.max(0, (keyword.relevance_score || 0) / 100));  // 0-100 -> 0-1
  const diversity = Math.min(1, Math.max(0, (keyword.diversity_score || 0) / 100));  // 0-100 -> 0-1
  const promptCount = keyword.prompt_count || 0;

  // Word count for complexity analysis
  const wordCount = keyword.text.split(/\s+/).length;

  // Difficulty Score (0-100): Higher difficulty means harder to rank
  // Factors: low score + high relevance + high diversity + competition
  let difficultyScore = 0;
  
  // Factor 1: Lower score = higher difficulty (40 points max)
  difficultyScore += (1 - score) * 40;
  
  // Factor 2: Higher relevance = more important/competitive (25 points max)
  difficultyScore += relevance * 25;
  
  // Factor 3: Higher diversity = more complex topic (20 points max)
  difficultyScore += diversity * 20;
  
  // Factor 4: More AI prompts = more competition (10 points max)
  difficultyScore += Math.min(promptCount / 20, 1) * 10;
  
  // Factor 5: Single words are often more competitive (5 points)
  if (wordCount === 1 && score < 0.5) {
    difficultyScore += 5;
  }

  difficultyScore = Math.min(100, Math.max(0, difficultyScore));

  // Complexity Level: Based on word count and diversity
  let complexityLevel: 'Low' | 'Medium' | 'High' = 'Low';
  
  if (wordCount === 1) {
    complexityLevel = 'Low';
  } else if (wordCount === 2) {
    complexityLevel = diversity > 0.5 ? 'Medium' : 'Low';
  } else if (wordCount === 3) {
    complexityLevel = diversity > 0.6 ? 'High' : 'Medium';
  } else {
    // 4+ words - always at least Medium, High if diverse
    complexityLevel = diversity > 0.5 ? 'High' : 'Medium';
  }

  // AI Generation Feasibility (0-100): Higher means easier to generate content
  // Factors: good existing score + clear topic (relevance) + lower complexity
  let aiFeasibility = 0;
  
  // Factor 1: Higher existing score = easier to improve (35 points max)
  aiFeasibility += score * 35;
  
  // Factor 2: Higher relevance = clearer topic for AI (30 points max)
  aiFeasibility += relevance * 30;
  
  // Factor 3: Lower diversity = less complex topic (20 points max)
  aiFeasibility += (1 - diversity) * 20;
  
  // Factor 4: Some AI usage = proven feasibility (10 points max)
  if (promptCount > 0) {
    aiFeasibility += Math.min(promptCount / 10, 1) * 10;
  }
  
  // Factor 5: Shorter content is easier to generate (5 points)
  if (wordCount <= 3) {
    aiFeasibility += 5;
  }

  aiFeasibility = Math.min(100, Math.max(0, aiFeasibility));

  return {
    difficulty_score: Math.round(difficultyScore),
    complexity_level: complexityLevel,
    ai_generation_feasibility: Math.round(aiFeasibility)
  };
}

export default function MindMapWebTree({ onClose }: MindMapWebTreeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [rootUrl, setRootUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<D3TreeNode | null>(null);
  const [primaryHost, setPrimaryHost] = useState<string | null>(null);
  const [totalUrlsUsed, setTotalUrlsUsed] = useState<number>(0);
  
  // Selected node for table view
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  
  // SEO data
  const [seoEnabled, setSeoEnabled] = useState<boolean>(true);
  const [seoBatchLoading, setSeoBatchLoading] = useState<boolean>(false);
  const [seoProgress, setSeoProgress] = useState<{ current: number; total: number; estimatedTimeRemaining?: number } | null>(null);
  const [seoByUrl, setSeoByUrl] = useState<Map<string, SEOData>>(new Map());
  
  // View mode: 'split' shows both tree and table, 'tree' shows only tree, 'table' shows only table
  const [viewMode, setViewMode] = useState<'split' | 'tree' | 'table'>('split');
  
  const [recenterKey, setRecenterKey] = useState<number>(0);

  // Load sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const response = await fetch('/api/data/sessions?limit=200');
        if (!response.ok) throw new Error('Failed to load sessions');
        const result = await response.json();
        const list: Session[] = result.sessions || [];
        setSessions(list);
        if (list.length > 0 && !selectedSessionId) {
          setSelectedSessionId(list[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load sessions');
      }
    };
    loadSessions();
  }, []);

  // Collect all URLs in the current tree
  function collectAllUrls(node: D3TreeNode | null): string[] {
    if (!node) return [];
    const acc: string[] = [];
    const stack: D3TreeNode[] = [node];
    while (stack.length) {
      const n = stack.pop()!;
      const full = (n.attributes?.full as string) || n.name;
      acc.push(normalizeUrl(full));
      if (n.children) for (const c of n.children) stack.push(c);
    }
    return Array.from(new Set(acc));
  }

  // Batch SEO extraction
  useEffect(() => {
    const run = async () => {
      if (!seoEnabled || !treeData) return;
      setSeoBatchLoading(true);

      const urls = collectAllUrls(treeData);
      const urlsToProcess = urls;

      if (urlsToProcess.length === 0) {
        setSeoBatchLoading(false);
        setSeoProgress(null);
        return;
      }

      setSeoProgress({ current: 0, total: urlsToProcess.length });
      await optimizedBatchedExtraction(urlsToProcess);
      setSeoBatchLoading(false);
      setSeoProgress(null);
    };

    const optimizedBatchedExtraction = async (urls: string[]) => {
      let concurrency = 3;
      if (urls.length > 1000) concurrency = 5;
      if (urls.length > 5000) concurrency = 8;

      const delayBetweenBatches = 50;
      let processedCount = 0;
      const startedAt = Date.now();

      const semaphore = new Array(concurrency).fill(null);
      let currentIndex = 0;

      const processUrl = async (url: string): Promise<void> => {
        try {
          const res = await fetch('/api/seo/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });

          if (res.status === 404) return;

          const data = await res.json().catch(() => ({} as any));
          if (res.ok && data) {
            setSeoByUrl(prev => {
              const next = new Map(prev);
              next.set(normalizeUrl(url), {
                parentText: data.parent?.text,
                topKeywords: Array.isArray(data.keywords)
                  ? data.keywords.slice(0, 10).map((k: any) => {
                      const baseKeyword: KeywordData = {
                        text: k.text,
                        score: k.score,
                        prompt_count: k.prompt_count,
                        relevance_score: k.relevance_score,
                        diversity_score: k.diversity_score
                      };
                      // Calculate content metrics
                      const metrics = calculateContentMetrics(baseKeyword);
                      
                      // Debug logging for first keyword
                      if (Math.random() < 0.05) { // Log ~5% of keywords to avoid spam
                        console.log('[SEO Metrics Debug]', {
                          keyword: baseKeyword.text,
                          rawScores: { score: k.score, relevance: k.relevance_score, diversity: k.diversity_score },
                          calculated: metrics
                        });
                      }
                      
                      return {
                        ...baseKeyword,
                        ...metrics
                      };
                    })
                  : []
              });
              return next;
            });
          }
        } catch {
          // ignore
        }

        processedCount++;
        const elapsedMs = Date.now() - startedAt;
        const avgPerItemMs = processedCount > 0 ? elapsedMs / processedCount : delayBetweenBatches;
        const remaining = urls.length - processedCount;
        const estimatedTimeRemaining = remaining > 0 ? Math.ceil((remaining * avgPerItemMs) / 1000) : 0;
        setSeoProgress({
          current: processedCount,
          total: urls.length,
          estimatedTimeRemaining
        });
      };

      const workers = semaphore.map(async () => {
        while (currentIndex < urls.length) {
          const urlIndex = currentIndex++;
          if (urlIndex >= urls.length) break;
          await processUrl(urls[urlIndex]);
          if (currentIndex < urls.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
          }
        }
      });

      await Promise.all(workers);
    };

    void run();
  }, [seoEnabled, treeData]);

  const buildTree = useCallback(async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    setError(null);
    try {
      let normalizedRoot = '' as string;
      let root: URL | null = null;
      const urls: string[] = [];
      let offset = 0;
      const limit = 1000;

      for (let i = 0; i < 50; i++) {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        params.set('sessionId', String(selectedSessionId));
        const res = await fetch(`/api/data/pages?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load URL list');
        const result = await res.json();
        const items = (result.data || []) as Array<{ url: string }>;
        if (items.length === 0) break;
        for (const it of items) {
          if (!it.url) continue;
          const nu = normalizeUrl(it.url);
          if (!isLikelyPageUrl(nu)) continue;
          urls.push(nu);
        }
        offset += items.length;
        if (result?.paging?.total && offset >= result.paging.total) break;
      }

      if (urls.length === 0) throw new Error('No URLs found for this session');
      const sess = sessions.find(s => s.id === selectedSessionId);
      const sessionStart = sess?.startUrl || urls[0];
      normalizedRoot = normalizeUrl(sessionStart);
      root = new URL(normalizedRoot);
      setRootUrl(normalizedRoot);
      setPrimaryHost(root.host);

      const rootNode: D3TreeNode = { 
        name: normalizedRoot, 
        attributes: { level: 0, full: normalizedRoot }, 
        children: [] 
      };

      const ensureChild = (parent: D3TreeNode, name: string, level: number, full: string): D3TreeNode => {
        if (!parent.children) parent.children = [];
        let child = parent.children.find(c => c.name === name);
        if (!child) {
          child = { name, attributes: { level, full }, children: [] };
          parent.children.push(child);
        }
        return child;
      };

      let usedCount = 0;
      for (const u of urls) {
        let parsed: URL;
        try { parsed = new URL(u); } catch { continue; }
        if (!root) continue;
        if (parsed.host !== root.host && !parsed.hostname.endsWith('.' + root.hostname)) continue;
        const segments = parsed.pathname.split('/').filter(Boolean);
        const maxSegments = segments.length;
        let current = rootNode;
        let currentFull = `${root.protocol}//${root.host}`;
        for (let i = 0; i < maxSegments; i++) {
          const seg = segments[i];
          currentFull += `/${seg}`;
          current = ensureChild(current, seg, ((current.attributes?.level as number) ?? 0) + 1, currentFull);
        }
        usedCount++;
      }

      rootNode.attributes = { ...(rootNode.attributes || {}), full: normalizedRoot };
      setTreeData(rootNode);
      setTotalUrlsUsed(usedCount);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build tree');
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, sessions]);

  // Convert tree data to TidyTree format - Show FULL URLs
  function convertToTidy(root: D3TreeNode | null): TidyTreeNode | null {
    if (!root) return null;
    const mapNode = (n: D3TreeNode, isRoot: boolean = false): TidyTreeNode => {
      const full = (n.attributes?.full as string) || n.name;
      
      // Always show full URL for better clarity
      let label: string = full;
      
      const baseChildren: TidyTreeNode[] = n.children && n.children.length 
        ? n.children.map(child => mapNode(child, false)) 
        : [];

      // Return node with full URL as text
      return {
        text: label,
        children: baseChildren.length ? baseChildren : undefined,
        ...(n.attributes && { attributes: n.attributes }) // Preserve attributes
      };
    };
    return mapNode(root, true);
  }

  // Handle node selection from tree
  const handleSelectPath = useCallback((path: string[]) => {
    if (path.length === 0) return;
    const url = path[path.length - 1]; // Last item in path is the full URL
    setSelectedUrl(url);
  }, []);

  const containerSize = useMemo(() => {
    const width = containerRef.current?.clientWidth || 1200;
    const height = containerRef.current?.clientHeight || 700;
    return { width, height };
  }, [containerRef.current]);

  function formatSeconds(totalSeconds?: number): string {
    if (totalSeconds == null || !isFinite(totalSeconds)) return '--:--';
    const s = Math.max(0, Math.round(totalSeconds));
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  const selectedSeoData = selectedUrl ? seoByUrl.get(normalizeUrl(selectedUrl)) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-11/12 h-5/6 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-white">🌳 Mind Map - Web Tree</h3>
            {primaryHost && (
              <span className="px-2 py-1 bg-blue-900 text-blue-300 rounded text-sm">
                Root: {primaryHost}
              </span>
            )}
            {totalUrlsUsed > 0 && (
              <span className="px-2 py-1 bg-purple-900 text-purple-300 rounded text-sm">
                URLs: {totalUrlsUsed}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-white">
              Session:
              <select
                value={selectedSessionId ?? ''}
                onChange={e => setSelectedSessionId(Number(e.target.value))}
                className="ml-2 px-3 py-1 bg-gray-700 text-white rounded border border-gray-600"
              >
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    #{s.id} · {s.startUrl || 'Unknown URL'} · {new Date(s.startedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              onClick={buildTree}
              disabled={!selectedSessionId || loading}
            >
              {loading ? 'Building…' : '🌳 Build Tree'}
            </button>

            <div className="flex items-center gap-2">
              <button
                className={`px-3 py-1 rounded ${viewMode === 'split' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                onClick={() => setViewMode('split')}
              >
                Split View
              </button>
              <button
                className={`px-3 py-1 rounded ${viewMode === 'tree' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                onClick={() => setViewMode('tree')}
              >
                Tree Only
              </button>
              <button
                className={`px-3 py-1 rounded ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                onClick={() => setViewMode('table')}
              >
                Table Only
              </button>
            </div>

            <label className="flex items-center gap-2 text-white">
              <input
                type="checkbox"
                checked={seoEnabled}
                onChange={e => setSeoEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              AI Keywords
            </label>

            {seoEnabled && seoBatchLoading && (
              <span className="px-2 py-1 bg-yellow-900 text-yellow-300 rounded text-sm flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-yellow-300 border-t-transparent rounded-full animate-spin"></span>
                {seoProgress && (
                  <>
                    <span>{seoProgress.current}/{seoProgress.total}</span>
                    <span className="opacity-80">ETA {formatSeconds(seoProgress.estimatedTimeRemaining)}</span>
                  </>
                )}
              </span>
            )}

            {error && <span className="text-red-400 text-sm">{error}</span>}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Tree View */}
          {(viewMode === 'split' || viewMode === 'tree') && (
            <div 
              ref={containerRef}
              className={`bg-gray-900 overflow-hidden relative ${viewMode === 'split' ? 'w-2/3' : 'w-full'}`}
            >
              {!treeData ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  {loading ? 'Building tree structure...' : 'Select a session and click "Build Tree"'}
                </div>
              ) : (
                <D3TidyTree
                  data={convertToTidy(treeData)!}
                  height={containerSize.height}
                  orientation="horizontal"
                  dx={120}
                  dy={400}
                  onSelectPath={handleSelectPath}
                  recenterKey={recenterKey}
                  initialExpandDepth={1}
                />
              )}

              {seoBatchLoading && (
                <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-[1px] flex items-center justify-center z-10">
                  <div className="flex items-center gap-3 text-yellow-200">
                    <span className="inline-block w-6 h-6 border-4 border-yellow-300 border-t-transparent rounded-full animate-spin"></span>
                    {seoProgress && (
                      <div className="text-sm">
                        <div className="font-semibold">Extracting AI keywords…</div>
                        <div className="opacity-90">{seoProgress.current}/{seoProgress.total} • ETA {formatSeconds(seoProgress.estimatedTimeRemaining)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table View */}
          {(viewMode === 'split' || viewMode === 'table') && (
            <div className={`bg-gray-850 border-l border-gray-700 overflow-auto ${viewMode === 'split' ? 'w-1/3' : 'w-full'}`}>
              <div className="p-4">
                <h4 className="text-lg font-semibold text-white mb-3">
                  🤖 AI Keywords & Scores
                </h4>

                {!selectedUrl ? (
                  <div className="text-gray-400 text-center py-8">
                    Click on a node in the tree to view AI keywords
                  </div>
                ) : (
                  <div>
                    {/* Selected URL */}
                    <div className="mb-4 p-3 bg-gray-900 rounded">
                      <div className="text-xs text-gray-400 mb-2">Selected URL</div>
                      <div className="flex items-start gap-2">
                        <a 
                          href={selectedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:text-blue-300 underline break-all flex-1 transition-colors"
                          title="Open in new tab"
                        >
                          {selectedUrl}
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedUrl);
                            // Optional: Show a toast notification
                          }}
                          className="flex-shrink-0 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                          title="Copy URL"
                        >
                          📋
                        </button>
                      </div>
                    </div>

                    {/* Parent Keyword */}
                    {selectedSeoData?.parentText && (
                      <div className="mb-4 p-3 bg-blue-900/30 rounded border border-blue-700">
                        <div className="text-xs text-blue-300 mb-1">Main Topic</div>
                        <div className="text-base font-semibold text-white">{selectedSeoData.parentText}</div>
                      </div>
                    )}

                    {/* Content Metrics Summary */}
                    {selectedSeoData?.topKeywords && selectedSeoData.topKeywords.length > 0 && (() => {
                      const keywords = selectedSeoData.topKeywords;
                      const avgDifficulty = keywords.reduce((sum, k) => sum + (k.difficulty_score ?? 0), 0) / keywords.length;
                      const avgFeasibility = keywords.reduce((sum, k) => sum + (k.ai_generation_feasibility ?? 0), 0) / keywords.length;
                      const complexityBreakdown = keywords.reduce((acc, k) => {
                        acc[k.complexity_level ?? 'Low']++;
                        return acc;
                      }, { Low: 0, Medium: 0, High: 0 });

                      return (
                        <div className="mb-4 grid grid-cols-3 gap-2">
                          <div className="p-3 bg-gradient-to-br from-red-900/30 to-red-800/20 rounded border border-red-700/50">
                            <div className="text-xs text-red-300 mb-1">Avg Difficulty</div>
                            <div className="text-2xl font-bold text-white">{avgDifficulty.toFixed(0)}</div>
                            <div className="text-xs text-red-200 mt-1">out of 100</div>
                          </div>
                          <div className="p-3 bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 rounded border border-yellow-700/50">
                            <div className="text-xs text-yellow-300 mb-1">Complexity</div>
                            <div className="text-lg font-bold text-white">
                              {complexityBreakdown.High > 0 ? 'High' : complexityBreakdown.Medium > 0 ? 'Medium' : 'Low'}
                            </div>
                            <div className="text-xs text-yellow-200 mt-1">
                              L:{complexityBreakdown.Low} M:{complexityBreakdown.Medium} H:{complexityBreakdown.High}
                            </div>
                          </div>
                          <div className="p-3 bg-gradient-to-br from-green-900/30 to-green-800/20 rounded border border-green-700/50">
                            <div className="text-xs text-green-300 mb-1">AI Feasibility</div>
                            <div className="text-2xl font-bold text-white">{avgFeasibility.toFixed(0)}%</div>
                            <div className="text-xs text-green-200 mt-1">generation score</div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Keywords Table */}
                    {selectedSeoData?.topKeywords && selectedSeoData.topKeywords.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-900 text-gray-300">
                              <th className="px-3 py-2 text-left">Keyword</th>
                              <th className="px-3 py-2 text-center">Score</th>
                              <th className="px-3 py-2 text-center">🤖 Prompts</th>
                              <th className="px-3 py-2 text-center">🎯 Relevance</th>
                              <th className="px-3 py-2 text-center">🌈 Diversity</th>
                              <th className="px-3 py-2 text-center">💪 Difficulty</th>
                              <th className="px-3 py-2 text-center">🎚️ Complexity</th>
                              <th className="px-3 py-2 text-center">🤖 AI Feasibility</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedSeoData.topKeywords.map((kw, idx) => {
                              // Helper functions for styling
                              const getDifficultyColor = (score: number) => {
                                if (score >= 70) return 'text-red-400';
                                if (score >= 40) return 'text-yellow-400';
                                return 'text-green-400';
                              };
                              const getComplexityColor = (level: string) => {
                                if (level === 'High') return 'text-red-400';
                                if (level === 'Medium') return 'text-yellow-400';
                                return 'text-green-400';
                              };
                              const getFeasibilityColor = (score: number) => {
                                if (score >= 70) return 'text-green-400';
                                if (score >= 40) return 'text-yellow-400';
                                return 'text-red-400';
                              };

                              return (
                                <tr 
                                  key={idx} 
                                  className="border-t border-gray-700 hover:bg-gray-800 transition-colors"
                                >
                                  <td className="px-3 py-2 text-gray-200 font-medium">{kw.text}</td>
                                  <td className="px-3 py-2 text-center text-green-400">{kw.score.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-center text-blue-400">{kw.prompt_count ?? 0}</td>
                                  <td className="px-3 py-2 text-center text-purple-400">{(kw.relevance_score ?? 0).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-center text-pink-400">{(kw.diversity_score ?? 0).toFixed(2)}</td>
                                  <td className={`px-3 py-2 text-center font-semibold ${getDifficultyColor(kw.difficulty_score ?? 0)}`}>
                                    {kw.difficulty_score ?? 0}
                                  </td>
                                  <td className={`px-3 py-2 text-center font-medium ${getComplexityColor(kw.complexity_level ?? 'Low')}`}>
                                    {kw.complexity_level ?? 'Low'}
                                  </td>
                                  <td className={`px-3 py-2 text-center font-semibold ${getFeasibilityColor(kw.ai_generation_feasibility ?? 0)}`}>
                                    {kw.ai_generation_feasibility ?? 0}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-gray-400 text-center py-4">
                        {seoEnabled ? 'No AI keywords available for this URL' : 'Enable AI Keywords to see data'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

