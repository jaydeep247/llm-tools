import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import '../../../pages/DataViewer.css';

interface PageMetric {
  url: string;
  title: string;
  titleLength?: number;
  titlePixelWidth?: number;
  titleStatus?: 'OK' | 'Missing' | 'Duplicate';
  duplicateTitleCount?: number;
  duplicateWith?: string[];
  resourceType?: string;
  description: string;
  descriptionLength?: number;
  descriptionPixelWidth?: number;
  metaDescriptionStatus?: 'OK' | 'Missing' | 'Duplicate';
  duplicateMetaDescriptionCount?: number;
  duplicateMetaDescriptionWith?: string[];
  canonicalUrl?: string | null; // From pages table
  canonicalValidationStatus?: 'Valid' | 'Invalid' | 'Missing' | 'Redirect' | 'Error' | 'Not Found' | 'Blocked';
  canonicalValidationMessage?: string;
  metaKeywords?: string;
  metaKeywordsLength?: number;
  contentType?: string;
  lastModified?: string | null;
  timestamp: string;
  success?: boolean;
  sessionId?: number;
}

interface PageMetricsProps {
  initialSessionId?: number | null;
}

const PageMetrics: React.FC<PageMetricsProps> = ({ initialSessionId }) => {
  const { accessToken, authFetch } = useAuth();
  const [data, setData] = useState<PageMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof PageMetric>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [sessions, setSessions] = useState<Array<{ id: number; startedAt: string; completedAt?: string; totalPages: number }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | ''>(initialSessionId ?? '');

  useEffect(() => {
    loadSessions();
  }, [accessToken]);

  useEffect(() => {
    if (initialSessionId) {
      setSelectedSessionId(initialSessionId);
    }
  }, [initialSessionId]);

  useEffect(() => {
    if (selectedSessionId !== '') {
      loadData();
    } else {
      setLoading(false);
      setData([]);
    }
  }, [selectedSessionId, accessToken]);

  const loadSessions = async () => {
    try {
      const res = await authFetch('/api/data/sessions?limit=200');
      if (!res.ok) {
        setSessions([]);
        return;
      }
      const result = await res.json();
      setSessions(result.sessions || []);
    } catch (e) {
      console.error('Failed to load sessions', e);
      setSessions([]);
    }
  };

  const loadData = async () => {
    if (!selectedSessionId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      params.set('sessionId', String(selectedSessionId));
      params.set('limit', '1000');
      
      const response = await authFetch(`/api/data/pages?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to load page metrics');
      }
      
      const result = await response.json();
      const pages = result.pages || [];
      
      // Transform to PageMetric format
      const metrics: PageMetric[] = pages.map((page: any) => ({
        url: page.url || '',
        title: page.title || 'No title',
        titleLength: page.titleLength || page.title_length,
        titlePixelWidth: page.titlePixelWidth || page.title_pixel_width,
        titleStatus: page.titleStatus || page.title_status,
        duplicateTitleCount: page.duplicateTitleCount ?? page.duplicate_title_count,
        duplicateWith: page.duplicateWith || (page.duplicate_with ? (typeof page.duplicate_with === 'string' ? JSON.parse(page.duplicate_with) : page.duplicate_with) : null),
        resourceType: page.resourceType || page.resource_type || 'PAGE',
        metaDescriptionStatus: page.metaDescriptionStatus || page.meta_description_status,
        duplicateMetaDescriptionCount: page.duplicateMetaDescriptionCount ?? page.duplicate_meta_description_count,
        duplicateMetaDescriptionWith: page.duplicateMetaDescriptionWith || (page.duplicate_meta_description_with ? (typeof page.duplicate_meta_description_with === 'string' ? JSON.parse(page.duplicate_meta_description_with) : page.duplicate_meta_description_with) : null),
        canonicalUrl: page.canonicalUrl ?? page.canonical_url ?? null,
        canonicalValidationStatus: page.canonicalValidationStatus || page.canonical_validation_status,
        canonicalValidationMessage: page.canonicalValidationMessage || page.canonical_validation_message,
        description: page.description || page.meta_description || 'No description',
        descriptionLength: page.descriptionLength || page.description_length || page.meta_description_length,
        descriptionPixelWidth: page.descriptionPixelWidth || page.description_pixel_width,
        metaKeywords: page.metaKeywords || page.meta_keywords,
        metaKeywordsLength: page.metaKeywordsLength || page.meta_keywords_length,
        contentType: page.contentType || page.content_type,
        lastModified: page.lastModified || page.last_modified,
        timestamp: page.timestamp || page.crawled_at || new Date().toISOString(),
        success: page.success !== false,
        sessionId: page.sessionId || page.session_id
      }));
      
      setData(metrics);
    } catch (err: any) {
      setError(err.message || 'Failed to load page metrics');
      console.error('Failed to load page metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: keyof PageMetric) => {
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
      (item.lastModified || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.titleStatus || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.metaDescriptionStatus || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.canonicalUrl || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.canonicalValidationStatus || '').toLowerCase().includes(searchTerm.toLowerCase())
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
      
      const response = await authFetch(`/api/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `page-metrics${selectedSessionId !== '' ? `-session-${selectedSessionId}` : ''}-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const getTitlePixelWidthBadge = (pixelWidth?: number) => {
    if (pixelWidth === undefined || pixelWidth === null) {
      return <span className="status-badge unknown" title="Width unknown">—</span>;
    }
    
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
    
    if (length && length > 0) {
      return <span className="status-badge redirect" title={keywords}>{keywords.substring(0, 30)}{keywords.length > 30 ? '...' : ''}</span>;
    }
    return <span className="status-badge unknown" title="Empty keywords">Empty</span>;
  };

  const getTitleStatusBadge = (status?: 'OK' | 'Missing' | 'Duplicate', duplicateWith?: string[]) => {
    if (!status) {
      return <span className="status-badge unknown" title="Status unknown">—</span>;
    }
    
    switch (status) {
      case 'OK':
        return <span className="status-badge success" title="Title is valid and unique">✅ OK</span>;
      case 'Missing':
        return <span className="status-badge client-error" title="Title is missing or invalid">❌ Missing</span>;
      case 'Duplicate':
        const duplicateUrls = duplicateWith && duplicateWith.length > 0 
          ? duplicateWith.join(', ')
          : 'Unknown URLs';
        return (
          <span className="status-badge redirect" title={`Title is duplicated. Matches with: ${duplicateUrls}`}>
            ⚠️ Duplicate
          </span>
        );
      default:
        return <span className="status-badge unknown" title="Unknown status">—</span>;
    }
  };

  const getDuplicateTitleBadge = (count?: number, duplicateWith?: string[]) => {
    if (count === undefined || count === null || count === 0) {
      return <span className="status-badge success" title="No duplicate titles">0</span>;
    }
    
    const duplicateUrls = duplicateWith && duplicateWith.length > 0 
      ? duplicateWith.slice(0, 3).join(', ') + (duplicateWith.length > 3 ? ` (+${duplicateWith.length - 3} more)` : '')
      : '';
    
    const title = duplicateUrls 
      ? `${count} duplicate${count > 1 ? 's' : ''}: ${duplicateUrls}`
      : `${count} duplicate${count > 1 ? 's' : ''}`;
    
    if (count > 5) {
      return <span className="status-badge client-error" title={title}>{count}</span>;
    } else {
      return <span className="status-badge redirect" title={title}>{count}</span>;
    }
  };

  const getMetaDescriptionStatusBadge = (status?: 'OK' | 'Missing' | 'Duplicate', duplicateWith?: string[]) => {
    if (!status) {
      return <span className="status-badge unknown" title="Status unknown">—</span>;
    }
    
    switch (status) {
      case 'OK':
        return <span className="status-badge success" title="Meta description is valid and unique">✅ OK</span>;
      case 'Missing':
        return <span className="status-badge client-error" title="Meta description is missing or invalid">❌ Missing</span>;
      case 'Duplicate':
        const duplicateUrls = duplicateWith && duplicateWith.length > 0 
          ? duplicateWith.join(', ')
          : 'Unknown URLs';
        return (
          <span className="status-badge redirect" title={`Meta description is duplicated. Matches with: ${duplicateUrls}`}>
            ⚠️ Duplicate
          </span>
        );
      default:
        return <span className="status-badge unknown" title="Unknown status">—</span>;
    }
  };

  const getDuplicateMetaDescriptionBadge = (count?: number, duplicateWith?: string[]) => {
    if (count === undefined || count === null || count === 0) {
      return <span className="status-badge success" title="No duplicate meta descriptions">0</span>;
    }
    
    const duplicateUrls = duplicateWith && duplicateWith.length > 0 
      ? duplicateWith.slice(0, 3).join(', ') + (duplicateWith.length > 3 ? ` (+${duplicateWith.length - 3} more)` : '')
      : '';
    
    const title = duplicateUrls 
      ? `${count} duplicate${count > 1 ? 's' : ''}: ${duplicateUrls}`
      : `${count} duplicate${count > 1 ? 's' : ''}`;
    
    if (count > 5) {
      return <span className="status-badge client-error" title={title}>{count}</span>;
    } else {
      return <span className="status-badge redirect" title={title}>{count}</span>;
    }
  };

  const getCanonicalValidationBadge = (status?: 'Valid' | 'Invalid' | 'Missing' | 'Redirect' | 'Error' | 'Not Found' | 'Blocked', message?: string) => {
    if (!status) {
      return <span className="status-badge unknown" title="Validation status unknown">—</span>;
    }
    
    const tooltip = message ? `${status}: ${message}` : status;
    
    switch (status) {
      case 'Valid':
        return <span className="status-badge success" title={tooltip}>✅ Valid</span>;
      case 'Missing':
        return <span className="status-badge redirect" title={tooltip}>ℹ️ Missing</span>;
      case 'Invalid':
        return <span className="status-badge client-error" title={tooltip}>❌ Invalid</span>;
      case 'Redirect':
        return <span className="status-badge redirect" title={tooltip}>⚠️ Redirect</span>;
      case 'Not Found':
        return <span className="status-badge client-error" title={tooltip}>❌ 404</span>;
      case 'Blocked':
        return <span className="status-badge client-error" title={tooltip}>🚫 Blocked</span>;
      case 'Error':
        return <span className="status-badge client-error" title={tooltip}>⚠️ Error</span>;
      default:
        return <span className="status-badge unknown" title={tooltip}>—</span>;
    }
  };

  if (loading && data.length === 0) {
    return (
      <div className="data-viewer" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="loading">Loading page metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-viewer" style={{ padding: '40px' }}>
        <div className="error-text">Error: {error}</div>
        <button onClick={loadData} className="export-btn" style={{ marginTop: '20px' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
      <div style={{ padding: '20px 30px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)' }}>
        <h2 style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.5rem' }}>
          <span>📊</span>
          Page Metrics
        </h2>
      </div>

      <div style={{ padding: '20px 30px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search URLs, titles, descriptions, content types, last modified..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 15px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(0, 0, 0, 0.6)',
              color: '#fff',
              fontSize: '14px'
            }}
          />
        </div>
        
        <select
          value={selectedSessionId}
          onChange={(e) => setSelectedSessionId(e.target.value === '' ? '' : Number(e.target.value))}
          style={{
            padding: '10px 15px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <option value="">Select a session</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              Session #{s.id} {s.startedAt ? `(${new Date(s.startedAt).toLocaleString()})` : ''}
            </option>
          ))}
        </select>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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

      <div style={{ padding: '15px 30px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', color: '#999', fontSize: '14px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <span>Total (loaded): {data.length} items</span>
        <span>Filtered: {filteredAndSortedData.length} items</span>
        <span>Page {currentPage} of {totalPages || 1}</span>
      </div>

      <div className="table-container" style={{ flex: 1, overflow: 'auto', overflowX: 'auto', padding: '0 30px', background: 'rgba(0, 0, 0, 0.3)' }}>
        <table className="data-table" style={{ background: 'transparent', color: '#fff', minWidth: '1400px', width: '100%' }}>
          <thead>
            <tr>
              <th onClick={() => handleSort('url')} className="sortable" style={{ background: 'rgba(0, 0, 0, 0.5)', color: '#fff', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                URL {sortField === 'url' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('title')} className="sortable" style={{ background: 'rgba(0, 0, 0, 0.5)', color: '#fff', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                TITLE {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('titleStatus')} className="sortable" style={{ background: 'rgba(0, 0, 0, 0.5)', color: '#fff', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                TITLE STATUS {sortField === 'titleStatus' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('duplicateTitleCount')} className="sortable" style={{ background: 'rgba(0, 0, 0, 0.5)', color: '#fff', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                TITLE DUPLICATE COUNT {sortField === 'duplicateTitleCount' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('metaDescriptionStatus')} className="sortable" style={{ background: 'rgba(0, 0, 0, 0.5)', color: '#fff', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                META DESC STATUS {sortField === 'metaDescriptionStatus' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('duplicateMetaDescriptionCount')} className="sortable" style={{ background: 'rgba(0, 0, 0, 0.5)', color: '#fff', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                META DESC DUPLICATE COUNT {sortField === 'duplicateMetaDescriptionCount' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('canonicalUrl')} className="sortable" style={{ background: 'rgba(0, 0, 0, 0.5)', color: '#fff', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                CANONICAL URL {sortField === 'canonicalUrl' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('canonicalValidationStatus')} className="sortable" style={{ background: 'rgba(0, 0, 0, 0.5)', color: '#fff', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                CANONICAL VALIDATION {sortField === 'canonicalValidationStatus' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {currentData.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  {selectedSessionId === '' ? 'Please select a session' : 'No data available'}
                </td>
              </tr>
            ) : (
              currentData.map((item, index) => (
                <tr key={index} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td className="url-cell" style={{ color: '#667eea' }}>
                    <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', textDecoration: 'none' }}>
                      {item.url || 'No URL'}
                    </a>
                  </td>
                  <td className="title-cell" title={item.title || 'No title'} style={{ color: '#fff' }}>
                    {item.title || 'No title'}
                  </td>
                  <td style={{ color: '#fff', maxWidth: '300px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {getTitleStatusBadge(item.titleStatus, item.duplicateWith)}
                      {item.titleStatus === 'Duplicate' && item.duplicateWith && item.duplicateWith.length > 0 && (
                        <div style={{ 
                          marginTop: '5px', 
                          fontSize: '12px', 
                          color: '#999',
                          maxHeight: '100px',
                          overflowY: 'auto',
                          padding: '5px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '4px'
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '3px', color: '#ffa500' }}>
                            Matches with:
                          </div>
                          {item.duplicateWith.map((url, idx) => (
                            <div key={idx} style={{ marginBottom: '2px' }}>
                              <a 
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ 
                                  color: '#667eea', 
                                  textDecoration: 'none',
                                  wordBreak: 'break-all',
                                  fontSize: '11px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                              >
                                {url}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ color: '#fff' }}>
                    {getDuplicateTitleBadge(item.duplicateTitleCount, item.duplicateWith)}
                  </td>
                  <td style={{ color: '#fff', maxWidth: '300px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {getMetaDescriptionStatusBadge(item.metaDescriptionStatus, item.duplicateMetaDescriptionWith)}
                      {item.metaDescriptionStatus === 'Duplicate' && item.duplicateMetaDescriptionWith && item.duplicateMetaDescriptionWith.length > 0 && (
                        <div style={{ 
                          marginTop: '5px', 
                          fontSize: '12px', 
                          color: '#999',
                          maxHeight: '100px',
                          overflowY: 'auto',
                          padding: '5px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '4px'
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '3px', color: '#ffa500' }}>
                            Matches with:
                          </div>
                          {item.duplicateMetaDescriptionWith.map((url, idx) => (
                            <div key={idx} style={{ marginBottom: '2px' }}>
                              <a 
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ 
                                  color: '#667eea', 
                                  textDecoration: 'none',
                                  wordBreak: 'break-all',
                                  fontSize: '11px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                              >
                                {url}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ color: '#fff' }}>
                    {getDuplicateMetaDescriptionBadge(item.duplicateMetaDescriptionCount, item.duplicateMetaDescriptionWith)}
                  </td>
                  <td style={{ color: '#fff', maxWidth: '300px' }}>
                    {item.canonicalUrl ? (
                      <a 
                        href={item.canonicalUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ 
                          color: '#667eea', 
                          textDecoration: 'none',
                          wordBreak: 'break-all',
                          fontSize: '12px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                        title={item.canonicalUrl}
                      >
                        {item.canonicalUrl.length > 50 ? item.canonicalUrl.substring(0, 50) + '...' : item.canonicalUrl}
                      </a>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={{ color: '#fff', maxWidth: '250px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {getCanonicalValidationBadge(item.canonicalValidationStatus, item.canonicalValidationMessage)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ padding: '20px 30px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: currentPage === 1 ? 'rgba(107, 114, 128, 0.2)' : 'rgba(0, 0, 0, 0.6)',
              color: '#fff',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1
            }}
          >
            Previous
          </button>
          <span style={{ color: '#999', fontSize: '14px', margin: '0 10px' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: currentPage === totalPages ? 'rgba(107, 114, 128, 0.2)' : 'rgba(0, 0, 0, 0.6)',
              color: '#fff',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.5 : 1
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default PageMetrics;
