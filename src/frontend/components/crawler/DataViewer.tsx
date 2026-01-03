import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './DataViewer.css';

interface CrawlData {
  url: string;
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
  headingTags?: string; // JSON string
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
                <th onClick={() => handleSort('sizeBytes' as keyof CrawlData)} className="sortable center-header">
                  Size (bytes) {sortField === 'sizeBytes' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                  <td className="size-bytes-cell">
                    {getSizeBadge(item.sizeBytes)}
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