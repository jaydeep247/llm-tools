import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './DataViewer.css';

interface CrawlData {
  url: string;
  closestDuplicateUrl?: string; // URL of the most similar page (closest near-duplicate match)
  closestDuplicateSimilarity?: number; // Similarity score (0.0-1.0) with the closest match
  nearDuplicateCount?: number; // Number of pages with similarity >= 0.75
  title: string;
  titleLength?: number;
  titlePixelWidth?: number;
  description: string;
  descriptionLength?: number;
  descriptionPixelWidth?: number;
  contentType: string;
  lastModified: string | null;
  statusCode: number | null;
  responseTime: number | null;
  timestamp: string;
  success?: boolean;
  resourceType?: string;
  sessionId?: number;
  scheduleId?: number;
  scheduleName?: string;
  wordCount?: number;
  sentenceCount?: number;
  averageWordsPerSentence?: number;
  fleschReadingEase?: number;
  readabilityLevel?: string;
  textToHtmlRatio?: number;
  crawlDepth?: number;
  folderDepth?: number;
  sizeBytes?: number;
  indexable?: boolean;
  indexabilityStatus?: string;
  metaKeywords?: string;
  metaKeywordsLength?: number;
  metaRobots?: string;
  xRobotsTag?: string;
  metaRefresh?: string;
  canonicalUrl?: string;
  relNext?: string;
  relPrev?: string;
  httpRelNext?: string;
  httpRelPrev?: string;
  amphtmlUrl?: string;
  transferredBytes?: number;
  totalTransferredBytes?: number;
  co2Mg?: number;
  carbonRating?: string;
  headingTags?: string; // JSON string
  linkScore?: number; // SEO Link Score (0-100)
  uniqueInlinks?: number; // Number of unique pages linking to this page
  uniqueJsInlinks?: number; // Number of unique pages linking via JS
  percentOfTotal?: number; // % of all internal links pointing to this page
  uniqueOutlinks?: number; // Number of unique distinct destination URLs this page links to
  uniqueJsOutlinks?: number; // Number of unique JS-rendered outbound links (not in raw HTML)
  uniqueExternalOutlinks?: number; // Number of unique external domain links on this page (from HTML)
  uniqueExternalJsOutlinks?: number; // Number of unique external links created/revealed via JavaScript
}

interface DataViewerProps {
  onClose: () => void;
  initialSessionId?: number | null;
}

const DataViewer: React.FC<DataViewerProps> = ({ onClose, initialSessionId }) => {
  const { accessToken } = useAuth(); // ✅ GET AUTH TOKEN FROM CONTEXT
  const [data, setData] = useState<CrawlData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // ✅ ADD ERROR STATE
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof CrawlData>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [serverLimit] = useState(1000);
  const [sessions, setSessions] = useState<Array<{ id: number; startedAt: string; completedAt?: string; scheduleId?: number }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | ''>(initialSessionId ?? '');

  // ✅ HELPER: Get auth headers
  const getAuthHeaders = (): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    console.log(`[DataViewer] Using auth headers:`, { hasToken: !!accessToken });
    return headers;
  };

  useEffect(() => {
    loadSessions();
  }, [accessToken]); // ✅ RELOAD WHEN TOKEN CHANGES

  // When initialSessionId changes on open, set the selected session and reload
  useEffect(() => {
    if (initialSessionId) {
      setSelectedSessionId(initialSessionId);
      setServerOffset(0);
    }
  }, [initialSessionId]);

  // Load data whenever selectedSessionId changes
  useEffect(() => {
    if (selectedSessionId !== '') {
      loadData();
    } else {
      setLoading(false);
      setData([]); // Clear data when no session is selected
    }
  }, [selectedSessionId, accessToken]); // ✅ RELOAD WHEN SESSION OR TOKEN CHANGES

  // ✅ IMPROVED: Better error handling and logging
  const loadData = async (opts?: { append?: boolean }) => {
    try {
      setLoading(true);
      setError(null); // Clear previous errors
      
      const params = new URLSearchParams();
      params.set('limit', String(serverLimit));
      params.set('offset', String(opts?.append ? serverOffset : 0));
      if (selectedSessionId !== '') params.set('sessionId', String(selectedSessionId));
      
      console.log(`[DataViewer] Loading data with params:`, {
        sessionId: selectedSessionId,
        limit: serverLimit,
        offset: opts?.append ? serverOffset : 0
      });
      
      const url = `/api/data/list?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(), // ✅ INCLUDE AUTH HEADERS
        credentials: 'include'
      });
      
      console.log(`[DataViewer] Response status:`, response.status);
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[DataViewer] HTTP Error ${response.status}:`, errorBody);
        
        if (response.status === 401) {
          setError('Authentication failed. Please log in again.');
          return;
        } else if (response.status === 403) {
          setError('You do not have permission to access this session.');
          return;
        } else if (response.status === 404) {
          setError('Session not found. It may have been deleted.');
          return;
        } else {
          setError(`Failed to load data: HTTP ${response.status}`);
          return;
        }
      }
      
      const result = await response.json();
      console.log('[DataViewer] Successfully received data:', result);
      console.log('[DataViewer] First item indexability:', result.data?.[0]?.indexable, result.data?.[0]?.indexabilityStatus);
      
      setServerTotal(result?.paging?.total ?? result?.pagination?.total ?? result?.data?.length ?? null);
      const items = result.data || [];
      
      if (opts?.append) {
        setData(prev => [...prev, ...items]);
      } else {
        setData(items);
      }
      setServerOffset((opts?.append ? serverOffset : 0) + items.length);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[DataViewer] Error loading data:', errorMsg);
      setError(`Failed to load data: ${errorMsg}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ IMPROVED: Add auth headers to sessions endpoint too
  const loadSessions = async () => {
    try {
      console.log('[DataViewer] Loading sessions...');
      const res = await fetch('/api/data/sessions?limit=200', {
        headers: getAuthHeaders(), // ✅ INCLUDE AUTH HEADERS
        credentials: 'include'
      });
      
      if (!res.ok) {
        console.warn(`[DataViewer] Sessions endpoint returned ${res.status}`);
        setSessions([]);
        return;
      }
      
      const result = await res.json();
      setSessions(result.sessions || []);
    } catch (e) {
      console.error('[DataViewer] Failed to load sessions', e);
      setSessions([]);
    }
  };

  const handleSort = (field: keyof CrawlData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedData = data
    .filter(item => 
      (item.url || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.contentType || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.lastModified || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      return 0;
    });

  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = filteredAndSortedData.slice(startIndex, endIndex);

  const exportData = async (format: string) => {
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      if (selectedSessionId !== '') {
        params.set('sessionId', String(selectedSessionId));
      }
      const response = await fetch(`/api/export?${params.toString()}`, {
        headers: getAuthHeaders(), // ✅ INCLUDE AUTH HEADERS
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `crawl-data${selectedSessionId !== '' ? `-session-${selectedSessionId}` : ''}-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatResponseTime = (time: number | null) => {
    if (time === null || time === undefined) return 'Not available';
    return `${time}ms`;
  };

  const formatLastModified = (lastModified: string | null) => {
    if (!lastModified) return 'Not available';
    try {
      return new Date(lastModified).toLocaleString();
    } catch {
      return lastModified; // Return raw value if parsing fails
    }
  };

  const getStatusBadge = (statusCode: number | null) => {
    if (statusCode === null || statusCode === undefined) {
      return <span className="status-badge unknown">N/A</span>;
    }
    if (statusCode >= 200 && statusCode < 300) {
      return <span className="status-badge success">{statusCode}</span>;
    } else if (statusCode >= 300 && statusCode < 400) {
      return <span className="status-badge redirect">{statusCode}</span>;
    } else if (statusCode >= 400 && statusCode < 500) {
      return <span className="status-badge client-error">{statusCode}</span>;
    } else if (statusCode >= 500) {
      return <span className="status-badge server-error">{statusCode}</span>;
    }
    return <span className="status-badge unknown">{statusCode}</span>;
  };

  const getIndexabilityBadge = (indexable?: boolean, status?: string) => {
    if (indexable === undefined || indexable === null) {
      return <span className="status-badge unknown" title="Indexability unknown">❓ Unknown</span>;
    }
    if (indexable) {
      return <span className="status-badge success" title={status || 'Indexable'}>✅ Indexable</span>;
    } else {
      return <span className="status-badge client-error" title={status || 'Not indexable'}>❌ {status || 'Noindex'}</span>;
    }
  };

  const getTitlePixelWidthBadge = (pixelWidth?: number) => {
    if (pixelWidth === undefined || pixelWidth === null) {
      return <span className="status-badge unknown" title="Width unknown">—</span>;
    }
    
    // Google typically displays ~600px of title in search results
    if (pixelWidth < 600) {
      return <span className="status-badge success" title="Optimal length for search results">{pixelWidth}px</span>;
    } else if (pixelWidth <= 700) {
      return <span className="status-badge redirect" title="Acceptable but may be truncated">{pixelWidth}px</span>;
    } else {
      return <span className="status-badge client-error" title="Too long, will be truncated">{pixelWidth}px</span>;
    }
  };

  const getDescriptionPixelWidthBadge = (pixelWidth?: number) => {
    if (pixelWidth === undefined || pixelWidth === null) {
      return <span className="status-badge unknown" title="Width unknown">—</span>;
    }
    
    // Google typically displays ~920px of description in search results (desktop)
    // Mobile is ~680px
    if (pixelWidth < 920) {
      return <span className="status-badge success" title="Optimal length for search results">{pixelWidth}px</span>;
    } else if (pixelWidth <= 1000) {
      return <span className="status-badge redirect" title="Acceptable but may be truncated on mobile">{pixelWidth}px</span>;
    } else {
      return <span className="status-badge client-error" title="Too long, will be truncated">{pixelWidth}px</span>;
    }
  };

  const getMetaKeywordsBadge = (keywords?: string, length?: number) => {
    if (!keywords || keywords === 'undefined' || keywords === 'null') {
      return <span className="status-badge unknown" title="No meta keywords">—</span>;
    }
    
    // Meta keywords are generally not used by Google anymore, but we still track them
    if (length && length > 0) {
      return <span className="status-badge redirect" title={keywords}>{keywords} ({length})</span>;
    }
    return <span className="status-badge unknown" title="Empty keywords">Empty</span>;
  };

  const getHeadingTagsBadge = (headingTagsJson?: string) => {
    if (!headingTagsJson || headingTagsJson === 'undefined' || headingTagsJson === 'null') {
      return <span className="status-badge unknown" title="No heading data">—</span>;
    }
    
    try {
      const tags = JSON.parse(headingTagsJson);
      const summary = `H1:${tags.h1 || 0} H2:${tags.h2 || 0} H3:${tags.h3 || 0}`;
      const fullSummary = `H1:${tags.h1 || 0} H2:${tags.h2 || 0} H3:${tags.h3 || 0} H4:${tags.h4 || 0} H5:${tags.h5 || 0} H6:${tags.h6 || 0}`;
      
      // Check for SEO issues
      if (tags.h1 === 0) {
        return <span className="status-badge client-error" title={`Missing H1! ${fullSummary}`}>{summary}</span>;
      } else if (tags.h1 > 1) {
        return <span className="status-badge redirect" title={`Multiple H1s! ${fullSummary}`}>{summary}</span>;
      } else {
        return <span className="status-badge success" title={fullSummary}>{summary}</span>;
      }
    } catch {
      return <span className="status-badge unknown" title="Invalid heading data">Error</span>;
    }
  };

  const getMetaRobotsBadge = (metaRobots?: string) => {
    if (!metaRobots || metaRobots === 'undefined' || metaRobots === 'null') {
      return <span className="status-badge unknown" title="No meta robots tag">—</span>;
    }
    
    const robotsLower = metaRobots.toLowerCase();
    
    // Check for noindex directive (SEO issue)
    if (robotsLower.includes('noindex')) {
      return <span className="status-badge client-error" title={metaRobots}>🚫 {metaRobots}</span>;
    }
    
    // Check for nofollow directive (warning)
    if (robotsLower.includes('nofollow')) {
      return <span className="status-badge redirect" title={metaRobots}>⚠️ {metaRobots}</span>;
    }
    
    // Default or index,follow (good)
    return <span className="status-badge success" title={metaRobots}>✓ {metaRobots}</span>;
  };

  const getXRobotsTagBadge = (xRobotsTag?: string) => {
    if (!xRobotsTag || xRobotsTag === 'undefined' || xRobotsTag === 'null') {
      return <span className="status-badge unknown" title="No X-Robots-Tag header">—</span>;
    }
    
    const robotsLower = xRobotsTag.toLowerCase();
    
    // Check for noindex directive (SEO issue)
    if (robotsLower.includes('noindex')) {
      return <span className="status-badge client-error" title={xRobotsTag}>🚫 {xRobotsTag}</span>;
    }
    
    // Check for nofollow directive (warning)
    if (robotsLower.includes('nofollow')) {
      return <span className="status-badge redirect" title={xRobotsTag}>⚠️ {xRobotsTag}</span>;
    }
    
    // Default or index,follow (good)
    return <span className="status-badge success" title={xRobotsTag}>✓ {xRobotsTag}</span>;
  };

  const getMetaRefreshBadge = (metaRefresh?: string) => {
    if (!metaRefresh || metaRefresh === 'undefined' || metaRefresh === 'null') {
      return <span className="status-badge unknown" title="No meta refresh tag">—</span>;
    }
    
    // Meta refresh is generally discouraged for SEO - always show as warning
    return <span className="status-badge redirect" title={`Meta Refresh: ${metaRefresh}`}>⚠️ {metaRefresh}</span>;
  };

  const getSentenceCountBadge = (sentenceCount?: number) => {
    if (sentenceCount === undefined || sentenceCount === null) {
      return <span className="status-badge unknown" title="Sentence count unknown">—</span>;
    }
    
    let badgeClass = 'status-badge';
    let title = `Sentence Count: ${sentenceCount}`;
    
    // Too few sentences → thin content (warning/error)
    // Too many → long-form content (good)
    if (sentenceCount < 5) {
      badgeClass += ' client-error';
      title += ' - Thin content (too few sentences)';
    } else if (sentenceCount < 15) {
      badgeClass += ' redirect';
      title += ' - Fair content (could use more sentences)';
    } else {
      badgeClass += ' success';
      title += ' - Rich content (good sentence count)';
    }
    
    return <span className={badgeClass} title={title}>{sentenceCount}</span>;
  };

  const getLinkScoreBadge = (linkScore?: number) => {
    if (linkScore === undefined || linkScore === null) {
      return <span className="status-badge unknown" title="Link Score not calculated">—</span>;
    }

    let badgeClass = 'status-badge';
    let emoji = '';
    let rating = '';
    let title = `Link Score: ${linkScore.toFixed(1)}`;

    if (linkScore >= 80) {
      badgeClass += ' success';
      emoji = '🌟';
      rating = 'Excellent';
      title += ' - Excellent (strong internal linking)';
    } else if (linkScore >= 60) {
      badgeClass += ' success';
      emoji = '✅';
      rating = 'Good';
      title += ' - Good (well-linked page)';
    } else if (linkScore >= 40) {
      badgeClass += ' redirect';
      emoji = '⚠️';
      rating = 'Fair';
      title += ' - Fair (could use more links)';
    } else if (linkScore >= 20) {
      badgeClass += ' redirect';
      emoji = '⚠️';
      rating = 'Weak';
      title += ' - Weak (needs more internal links)';
    } else {
      badgeClass += ' client-error';
      emoji = '❌';
      rating = 'Very Weak';
      title += ' - Very Weak (orphan or poorly linked)';
    }

    return (
      <span className={badgeClass} title={title}>
        {emoji} {linkScore.toFixed(1)} <small>({rating})</small>
      </span>
    );
  };

  const getAverageWordsPerSentenceBadge = (avgWordsPerSentence?: number) => {
    if (avgWordsPerSentence === undefined || avgWordsPerSentence === null) {
      return <span className="status-badge unknown" title="Average words per sentence unknown">—</span>;
    }
    
    let badgeClass = 'status-badge';
    let title = `Average Words Per Sentence: ${avgWordsPerSentence.toFixed(2)}`;
    
    // Optimal range: 15-20 words per sentence for readability
    // Too short (< 10): choppy, may lack detail
    // Too long (> 25): difficult to read, complex
    if (avgWordsPerSentence < 10) {
      badgeClass += ' redirect';
      title += ' - Short sentences (may lack detail)';
    } else if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 25) {
      badgeClass += ' success';
      title += ' - Optimal readability';
    } else {
      badgeClass += ' redirect';
      title += ' - Long sentences (may be difficult to read)';
    }
    
    return <span className={badgeClass} title={title}>{avgWordsPerSentence.toFixed(2)}</span>;
  };

  const getFleschReadingEaseBadge = (fleschScore?: number) => {
    if (fleschScore === undefined || fleschScore === null) {
      return <span className="status-badge unknown" title="Flesch Reading Ease score unknown">—</span>;
    }
    
    let badgeClass = 'status-badge';
    let title = `Flesch Reading Ease: ${fleschScore.toFixed(1)}`;
    let level = '';
    
    // Score interpretation:
    // 90-100: Very Easy (5th grade) - Green
    // 80-89: Easy (6th grade) - Green
    // 70-79: Fairly Easy (7th grade) - Green/Yellow
    // 60-69: Standard (8th-9th grade) - Yellow
    // 50-59: Fairly Difficult (10th-12th grade) - Yellow/Red
    // 30-49: Difficult (College) - Red
    // 0-29: Very Difficult (College graduate) - Red
    if (fleschScore >= 90) {
      badgeClass += ' success';
      level = 'Very Easy (5th grade)';
    } else if (fleschScore >= 80) {
      badgeClass += ' success';
      level = 'Easy (6th grade)';
    } else if (fleschScore >= 70) {
      badgeClass += ' success';
      level = 'Fairly Easy (7th grade)';
    } else if (fleschScore >= 60) {
      badgeClass += ' redirect';
      level = 'Standard (8th-9th grade)';
    } else if (fleschScore >= 50) {
      badgeClass += ' redirect';
      level = 'Fairly Difficult (10th-12th grade)';
    } else if (fleschScore >= 30) {
      badgeClass += ' client-error';
      level = 'Difficult (College)';
    } else {
      badgeClass += ' client-error';
      level = 'Very Difficult (College graduate)';
    }
    
    title += ` - ${level}`;
    
    return <span className={badgeClass} title={title}>{fleschScore.toFixed(1)}</span>;
  };

  const getReadabilityLevelBadge = (level?: string) => {
    if (!level) {
      return <span className="status-badge unknown" title="Readability level unknown">—</span>;
    }

    const normalized = level.toLowerCase();
    let badgeClass = 'status-badge';
    let title = `Readability: ${level}`;

    if (normalized.includes('easy')) {
      badgeClass += ' success';
    } else if (normalized.includes('standard') || normalized.includes('fair')) {
      badgeClass += ' redirect';
    } else if (normalized.includes('difficult')) {
      badgeClass += ' client-error';
    } else {
      badgeClass += ' redirect';
    }

    return <span className={badgeClass} title={title}>{level}</span>;
  };

  const getTextToHtmlRatioBadge = (ratio?: number) => {
    // Handle undefined, null, or NaN - but 0 is a valid value (no text content)
    if (ratio === undefined || ratio === null || (ratio !== 0 && isNaN(ratio))) {
      return <span className="status-badge unknown" title="Text ratio unknown">—</span>;
    }
    
    let badgeClass = 'status-badge';
    let title = `Text Ratio: ${ratio.toFixed(2)}%`;
    
    // Good range: 20%–40%
    // Low ratio (< 20%) → heavy code / thin content (warning)
    // Good ratio (20-40%) → meaningful content (success)
    // High ratio (> 40%) → mostly text, minimal HTML (info)
    // 0% → no text content (error)
    if (ratio === 0) {
      badgeClass += ' client-error';
      title += ' - No text content';
    } else if (ratio >= 20 && ratio <= 40) {
      badgeClass += ' success';
      title += ' - Healthy ratio (good content)';
    } else if (ratio < 20) {
      badgeClass += ' client-error';
      title += ' - Low ratio (heavy code/thin content)';
    } else {
      badgeClass += ' redirect';
      title += ' - High ratio (mostly text)';
    }
    
    return <span className={badgeClass} title={title}>{ratio.toFixed(2)}%</span>;
  };

  const getCrawlDepthBadge = (depth?: number) => {
    if (depth === undefined || depth === null) {
      return <span className="status-badge unknown" title="Crawl depth unknown">—</span>;
    }
    
    let badgeClass = 'status-badge';
    let title = `Crawl Depth: ${depth} clicks from homepage`;
    
    // SEO rule: Important pages should be within 3 clicks
    if (depth === 0) {
      badgeClass += ' success';
      title += ' - Homepage (optimal)';
    } else if (depth <= 3) {
      badgeClass += ' success';
      title += ' - Good (within SEO recommendation)';
    } else if (depth <= 5) {
      badgeClass += ' redirect';
      title += ' - Acceptable (may need optimization)';
    } else {
      badgeClass += ' client-error';
      title += ' - Too deep (SEO issue - important pages should be within 3 clicks)';
    }
    
    return <span className={badgeClass} title={title}>{depth}</span>;
  };

  const getFolderDepthBadge = (depth?: number) => {
    if (depth === undefined || depth === null) {
      return <span className="status-badge unknown" title="Folder depth unknown">—</span>;
    }
    
    let badgeClass = 'status-badge';
    let title = `Folder Depth: ${depth} folders in URL path`;
    
    // Shallow URLs are preferred
    if (depth === 0) {
      badgeClass += ' success';
      title += ' - Root level (optimal)';
    } else if (depth <= 2) {
      badgeClass += ' success';
      title += ' - Shallow (good for SEO)';
    } else if (depth <= 4) {
      badgeClass += ' redirect';
      title += ' - Moderate (acceptable)';
    } else {
      badgeClass += ' client-error';
      title += ' - Deep (can confuse users & crawlers)';
    }
    
    return <span className={badgeClass} title={title}>{depth}</span>;
  };

  const getSizeBadge = (sizeBytes?: number) => {
    if (!sizeBytes || sizeBytes === 0) {
      return <span className="status-badge unknown" title="Size unknown">—</span>;
    }
    
    // Format size in human-readable format
    let formattedSize: string;
    let badgeClass = 'status-badge';
    
    if (sizeBytes < 1024) {
      formattedSize = `${sizeBytes} B`;
      badgeClass += ' success'; // Small size is good
    } else if (sizeBytes < 1024 * 1024) {
      const kb = (sizeBytes / 1024).toFixed(2);
      formattedSize = `${kb} KB`;
      badgeClass += sizeBytes < 100 * 1024 ? ' success' : ' redirect'; // <100KB good, else warning
    } else {
      const mb = (sizeBytes / (1024 * 1024)).toFixed(2);
      formattedSize = `${mb} MB`;
      badgeClass += sizeBytes < 2 * 1024 * 1024 ? ' redirect' : ' client-error'; // <2MB warning, else error
    }
    
    return <span className={badgeClass} title={`${sizeBytes.toLocaleString()} bytes`}>{formattedSize}</span>;
  };

  const formatSimilarity = (similarity?: number) => {
    if (similarity === undefined || similarity === null || isNaN(similarity)) return '—';
    return `${(similarity * 100).toFixed(1)}%`;
  };

  const getNearDuplicateCountBadge = (count?: number) => {
    if (count === undefined || count === null) {
      return <span className="status-badge unknown" title="Near-duplicate count unknown">—</span>;
    }

    let badgeClass = 'status-badge';
    let title = `No. Near Duplicates: ${count}`;

    if (count === 0) {
      badgeClass += ' success';
      title += ' - Unique content (good)';
    } else if (count <= 2) {
      badgeClass += ' redirect';
      title += ' - Some overlap (watch for cannibalization)';
    } else {
      badgeClass += ' client-error';
      title += ' - High risk of content cannibalization';
    }

    return <span className={badgeClass} title={title}>{count}</span>;
  };

  const getCanonicalBadge = (canonicalUrl?: string, currentUrl?: string) => {
    if (!canonicalUrl || canonicalUrl === 'undefined' || canonicalUrl === 'null') {
      return <span className="status-badge unknown" title="No canonical URL set">—</span>;
    }
    
    // Check if canonical URL matches current URL
    const isSelfReferencing = canonicalUrl === currentUrl;
    
    if (isSelfReferencing) {
      return <span className="status-badge success" title={`Self-referencing: ${canonicalUrl}`}>✓ Self</span>;
    } else {
      return <span className="status-badge redirect" title={`Points to: ${canonicalUrl}`}>➡️ {canonicalUrl}</span>;
    }
  };

  const getPaginationBadge = (url?: string, type?: 'next' | 'prev') => {
    if (!url || url === 'undefined' || url === 'null') {
      return <span className="status-badge unknown" title="No link">—</span>;
    }
    
    const icon = type === 'next' ? '➡️' : '⬅️';
    return <span className="status-badge redirect" title={`${type === 'next' ? 'Next' : 'Previous'}: ${url}`}>{icon} {url}</span>;
  };

  const getAmpBadge = (url?: string) => {
    if (!url || url === 'undefined' || url === 'null') {
      return <span className="status-badge unknown" title="No AMP version">—</span>;
    }
    return <span className="status-badge success" title={`AMP URL: ${url}`}>⚡ {url}</span>;
  };

  const getCarbonRatingBadge = (rating?: string, co2?: number) => {
    if (!rating) return <span className="status-badge unknown">—</span>;
    
    let className = 'status-badge';
    // A+ to B is good (success/green), C is okay (redirect/yellow), D-F is bad (error/red)
    if (['A+', 'A', 'B'].includes(rating)) className += ' success';
    else if (['C'].includes(rating)) className += ' redirect';
    else className += ' client-error';
    
    return (
      <span className={className} title={`${co2 ? co2 + 'mg CO2' : ''}`}>
        {rating} {co2 ? `(${co2}mg)` : ''}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="data-viewer-overlay">
        <div className="data-viewer">
          <div className="data-viewer-header">
            <h2>📊 Loading Data...</h2>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-gray-300">Loading session data...</span>
          </div>
        </div>
      </div>
    );
  }

  // ✅ IMPROVED: Show error state to user
  if (error) {
    return (
      <div className="data-viewer-overlay">
        <div className="data-viewer">
          <div className="data-viewer-header">
            <h2>📊 Error Loading Data</h2>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
          <div style={{ backgroundColor: '#7f2d2d', border: '1px solid #c24646', borderRadius: '8px', padding: '16px', margin: '16px' }}>
            <p style={{ color: '#ffcccc', fontWeight: 'bold' }}>⚠️ Error</p>
            <p style={{ color: '#ffeeee', marginTop: '8px' }}>{error}</p>
            <button
              onClick={() => loadData()}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                backgroundColor: '#c24646',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="data-viewer-overlay">
      <div className="data-viewer">
        <div className="data-viewer-header">
          <h2>📊 Crawl Data Viewer</h2>
          <button onClick={onClose} className="close-btn" title="Close Data Viewer">
            ×
          </button>
        </div>

        <div className="data-viewer-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search URLs, titles, descriptions, content types, last modified..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="session-filter">
            <select
              value={selectedSessionId}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : Number(e.target.value);
                setSelectedSessionId(v);
                setServerOffset(0);
                setData([]); // Clear existing data immediately
              }}
              className="search-input"
              title="Filter by session"
            >
              <option value="" disabled>Select a session</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  Session #{s.id} {s.startedAt ? `(${new Date(s.startedAt).toLocaleString()})` : ''}
                </option>
              ))}
            </select>
          </div>
          
          <div className="export-controls">
            <button onClick={() => exportData('json')} className="export-btn">
              📥 JSON
            </button>
            <button onClick={() => exportData('csv')} className="export-btn">
              📊 CSV
            </button>
            <button onClick={() => exportData('txt')} className="export-btn">
              📄 TXT
            </button>
            <button onClick={() => exportData('xml')} className="export-btn">
              📋 XML
            </button>
          </div>
        </div>

        <div className="data-stats">
          <span>Total (loaded): {data.length} items</span>
          {serverTotal !== null && (
            <span>Server total: {serverTotal}</span>
          )}
          <span>Filtered: {filteredAndSortedData.length} items</span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('url')} className="sortable">
                  URL {sortField === 'url' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                {/* Schedule and Session columns removed per request */}
                <th onClick={() => handleSort('title')} className="sortable">
                  Title {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('titleLength')} className="sortable center-header">
                  Title Length {sortField === 'titleLength' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="center-header">
                  Title Width (px)
                </th>
                <th className="center-header">
                  Resource Type
                </th>
                <th onClick={() => handleSort('description')} className="sortable">
                  Meta Description {sortField === 'description' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('descriptionLength')} className="sortable center-header">
                  Description Length {sortField === 'descriptionLength' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="center-header">
                  Description Width (px)
                </th>
                <th onClick={() => handleSort('metaKeywords')} className="sortable center-header">
                  Meta Keywords {sortField === 'metaKeywords' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('metaKeywordsLength')} className="sortable center-header">
                  Keywords Length {sortField === 'metaKeywordsLength' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('metaRobots')} className="sortable center-header">
                  Meta Robots {sortField === 'metaRobots' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('xRobotsTag')} className="sortable center-header">
                  X-Robots-Tag {sortField === 'xRobotsTag' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('metaRefresh')} className="sortable center-header">
                  Meta Refresh {sortField === 'metaRefresh' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('canonicalUrl')} className="sortable">
                  Canonical URL {sortField === 'canonicalUrl' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('amphtmlUrl' as keyof CrawlData)} className="sortable">
                  AMP {sortField === 'amphtmlUrl' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('relNext')} className="sortable center-header">
                  rel="next" {sortField === 'relNext' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('relPrev')} className="sortable center-header">
                  rel="prev" {sortField === 'relPrev' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('httpRelNext')} className="sortable center-header">
                  HTTP rel="next" {sortField === 'httpRelNext' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('httpRelPrev')} className="sortable center-header">
                  HTTP rel="prev" {sortField === 'httpRelPrev' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="center-header">
                  Heading Tags
                </th>
                <th onClick={() => handleSort('contentType')} className="sortable center-header">
                  Content Type {sortField === 'contentType' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('lastModified')} className="sortable center-header">
                  Last Modified {sortField === 'lastModified' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('statusCode')} className="sortable center-header">
                  Status {sortField === 'statusCode' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('responseTime')} className="sortable center-header">
                  Response Time {sortField === 'responseTime' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('wordCount' as keyof CrawlData)} className="sortable center-header">
                  Word Count {sortField === 'wordCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('sentenceCount' as keyof CrawlData)} className="sortable center-header">
                  Sentence Count {sortField === 'sentenceCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('averageWordsPerSentence' as keyof CrawlData)} className="sortable center-header">
                  Avg Words/Sentence {sortField === 'averageWordsPerSentence' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('fleschReadingEase' as keyof CrawlData)} className="sortable center-header">
                  Flesch Reading Ease {sortField === 'fleschReadingEase' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('readabilityLevel' as keyof CrawlData)} className="sortable center-header">
                  Readability {sortField === 'readabilityLevel' && (sortDirection === 'asc' ? '↑' : '↓')}
~~                </th>
                <th onClick={() => handleSort('textToHtmlRatio' as keyof CrawlData)} className="sortable center-header">
                  Text Ratio {sortField === 'textToHtmlRatio' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('crawlDepth' as keyof CrawlData)} className="sortable center-header">
                  Crawl Depth {sortField === 'crawlDepth' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('folderDepth' as keyof CrawlData)} className="sortable center-header">
                  Folder Depth {sortField === 'folderDepth' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('linkScore' as keyof CrawlData)} className="sortable center-header">
                  Link Score {sortField === 'linkScore' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('closestDuplicateUrl' as keyof CrawlData)} className="sortable">
                  Closest Near Duplicate Match {sortField === 'closestDuplicateUrl' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('nearDuplicateCount' as keyof CrawlData)} className="sortable center-header">
                  No. Near Duplicates {sortField === 'nearDuplicateCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('uniqueInlinks' as keyof CrawlData)} className="sortable center-header">
                  Unique Inlinks {sortField === 'uniqueInlinks' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('uniqueJsInlinks' as keyof CrawlData)} className="sortable center-header">
                  Unique JS Inlinks {sortField === 'uniqueJsInlinks' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('percentOfTotal' as keyof CrawlData)} className="sortable center-header">
                  % of Total {sortField === 'percentOfTotal' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('uniqueOutlinks' as keyof CrawlData)} className="sortable center-header">
                  Unique Outlinks {sortField === 'uniqueOutlinks' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('uniqueJsOutlinks' as keyof CrawlData)} className="sortable center-header">
                  Unique JS Outlinks {sortField === 'uniqueJsOutlinks' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('uniqueExternalOutlinks' as keyof CrawlData)} className="sortable center-header">
                  Unique External Outlinks {sortField === 'uniqueExternalOutlinks' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('uniqueExternalJsOutlinks' as keyof CrawlData)} className="sortable center-header">
                  Unique External JS Outlinks {sortField === 'uniqueExternalJsOutlinks' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('sizeBytes' as keyof CrawlData)} className="sortable center-header">
                  Size (bytes) {sortField === 'sizeBytes' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('transferredBytes')} className="sortable center-header">
                  Transferred (bytes) {sortField === 'transferredBytes' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('totalTransferredBytes')} className="sortable center-header">
                  Total Transferred (bytes) {sortField === 'totalTransferredBytes' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('co2Mg')} className="sortable center-header">
                  CO2 (mg) {sortField === 'co2Mg' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('carbonRating')} className="sortable center-header">
                  Carbon Rating {sortField === 'carbonRating' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="center-header">
                  Indexability
                </th>
                <th onClick={() => handleSort('timestamp')} className="sortable center-header">
                  Timestamp {sortField === 'timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {currentData.map((item, index) => (
                <tr key={index} className={item.success ? 'success-row' : 'error-row'}>
                  <td className="url-cell">
                    <a href={item.url || '#'} target="_blank" rel="noopener noreferrer">
                      {item.url || 'No URL'}
                    </a>
                  </td>
                  {/* Schedule and Session cells removed; filtering remains via dropdown */}
                  <td className="title-cell" title={item.title || 'No title'}>
                    {item.title || 'No title'}
                  </td>
                  <td className="title-length-cell">
                    {item.titleLength ?? '—'}
                  </td>
                  <td className="title-pixel-width-cell">
                    {getTitlePixelWidthBadge(item.titlePixelWidth)}
                  </td>
                  <td className="resource-type-cell">
                    {item.resourceType ? item.resourceType.toUpperCase() : 'PAGE'}
                  </td>
                  <td className="description-cell" title={item.description || 'No description'}>
                    {item.description || 'No description'}
                  </td>
                  <td className="description-length-cell">
                    {item.descriptionLength ?? '—'}
                  </td>
                  <td className="description-pixel-width-cell">
                    {getDescriptionPixelWidthBadge(item.descriptionPixelWidth)}
                  </td>
                  <td className="meta-keywords-cell" title={item.metaKeywords || 'No meta keywords'}>
                    {getMetaKeywordsBadge(item.metaKeywords, item.metaKeywordsLength)}
                  </td>
                  <td className="meta-keywords-length-cell">
                    {item.metaKeywordsLength ?? '—'}
                  </td>
                  <td className="meta-robots-cell">
                    {getMetaRobotsBadge(item.metaRobots)}
                  </td>
                  <td className="x-robots-tag-cell">
                    {getXRobotsTagBadge(item.xRobotsTag)}
                  </td>
                  <td className="meta-refresh-cell">
                    {getMetaRefreshBadge(item.metaRefresh)}
                  </td>
                  <td className="canonical-url-cell">
                    {getCanonicalBadge(item.canonicalUrl, item.url)}
                  </td>
                  <td className="amp-url-cell">
                    {getAmpBadge(item.amphtmlUrl)}
                  </td>
                  <td className="pagination-cell">
                    {getPaginationBadge(item.relNext, 'next')}
                  </td>
                  <td className="pagination-cell">
                    {getPaginationBadge(item.relPrev, 'prev')}
                  </td>
                  <td className="pagination-cell">
                    {getPaginationBadge(item.httpRelNext, 'next')}
                  </td>
                  <td className="pagination-cell">
                    {getPaginationBadge(item.httpRelPrev, 'prev')}
                  </td>
                  <td className="heading-tags-cell">
                    {getHeadingTagsBadge(item.headingTags)}
                  </td>
                  <td className="content-type-cell" title={item.contentType || 'Unknown'}>
                    {item.contentType || 'Unknown'}
                  </td>
                  <td className="last-modified-cell" title={item.lastModified || 'Not available'}>
                    {formatLastModified(item.lastModified)}
                  </td>
                  <td className="status-cell">
                    {getStatusBadge(item.statusCode || 0)}
                  </td>
                  <td className="response-time-cell">
                    {formatResponseTime(item.responseTime || 0)}
                  </td>
                  <td className="word-count-cell">
                    {item.wordCount ?? '—'}
                  </td>
                  <td className="sentence-count-cell">
                    {getSentenceCountBadge(item.sentenceCount)}
                  </td>
                  <td className="average-words-per-sentence-cell">
                    {getAverageWordsPerSentenceBadge(item.averageWordsPerSentence)}
                  </td>
                  <td className="flesch-reading-ease-cell">
                    {getFleschReadingEaseBadge(item.fleschReadingEase)}
                  </td>
                  <td className="readability-level-cell">
                    {getReadabilityLevelBadge(item.readabilityLevel)}
                  </td>
                  <td className="text-to-html-ratio-cell">
                    {getTextToHtmlRatioBadge(item.textToHtmlRatio)}
                  </td>
                  <td className="crawl-depth-cell">
                    {getCrawlDepthBadge(item.crawlDepth)}
                  </td>
                  <td className="folder-depth-cell">
                    {getFolderDepthBadge(item.folderDepth)}
                  </td>
                  <td className="link-score-cell">
                    {getLinkScoreBadge(item.linkScore)}
                  </td>
                  <td className="closest-duplicate-cell">
                    {item.closestDuplicateUrl ? (
                      <a
                        href={item.closestDuplicateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Closest match: ${item.closestDuplicateUrl} (${formatSimilarity(item.closestDuplicateSimilarity)})`}
                      >
                        {item.closestDuplicateUrl}
                      </a>
                    ) : (
                      <span className="status-badge unknown" title="No near-duplicate found">—</span>
                    )}
                  </td>
                  <td className="near-duplicate-count-cell">
                    {getNearDuplicateCountBadge(item.nearDuplicateCount)}
                  </td>
                  <td className="unique-inlinks-cell">
                    {item.uniqueInlinks !== undefined ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {item.uniqueInlinks}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="unique-js-inlinks-cell">
                    {item.uniqueJsInlinks !== undefined && item.uniqueJsInlinks > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        {item.uniqueJsInlinks}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="percent-of-total-cell">
                    {item.percentOfTotal !== undefined && item.percentOfTotal > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {item.percentOfTotal.toFixed(2)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="unique-outlinks-cell">
                    {item.uniqueOutlinks !== undefined ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800" title={`${item.uniqueOutlinks} distinct destination URLs`}>
                        {item.uniqueOutlinks}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="unique-js-outlinks-cell">
                    {item.uniqueJsOutlinks !== undefined && item.uniqueJsOutlinks > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800" title={`${item.uniqueJsOutlinks} JS-rendered outbound links (not in raw HTML)`}>
                        {item.uniqueJsOutlinks}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="unique-external-outlinks-cell">
                    {item.uniqueExternalOutlinks !== undefined && item.uniqueExternalOutlinks > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800" title={`${item.uniqueExternalOutlinks} distinct external domain links`}>
                        {item.uniqueExternalOutlinks}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="unique-external-js-outlinks-cell">
                    {item.uniqueExternalJsOutlinks !== undefined && item.uniqueExternalJsOutlinks > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800" title={`${item.uniqueExternalJsOutlinks} external links created/revealed via JavaScript`}>
                        {item.uniqueExternalJsOutlinks}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="size-bytes-cell">
                    {getSizeBadge(item.sizeBytes)}
                  </td>
                  <td className="size-bytes-cell">
                    {getSizeBadge(item.transferredBytes)}
                  </td>
                  <td className="size-bytes-cell">
                    {getSizeBadge(item.totalTransferredBytes)}
                  </td>
                  <td className="co2-cell">
                    {item.co2Mg ? `${item.co2Mg} mg` : '—'}
                  </td>
                  <td className="carbon-rating-cell">
                    {getCarbonRatingBadge(item.carbonRating, item.co2Mg)}
                  </td>
                  <td className="indexability-cell">
                    {getIndexabilityBadge(item.indexable, item.indexabilityStatus)}
                  </td>
                  <td className="timestamp-cell">
                    {formatTimestamp(item.timestamp || new Date().toISOString())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button 
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="page-btn"
            >
              First
            </button>
            <button 
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="page-btn"
            >
              Previous
            </button>
            
            <span className="page-info">
              Page {currentPage} of {totalPages}
            </span>
            
            <button 
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="page-btn"
            >
              Next
            </button>
            <button 
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="page-btn"
            >
              Last
            </button>
          </div>
        )}

        {serverTotal !== null && data.length < serverTotal && (
          <div className="pagination">
            <button 
              onClick={() => loadData({ append: true })}
              className="page-btn"
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default DataViewer;