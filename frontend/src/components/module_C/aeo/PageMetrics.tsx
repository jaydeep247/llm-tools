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
  canonicalUrl?: string | null;
  canonicalValidationStatus?: 'Valid' | 'Invalid' | 'Missing' | 'Redirect' | 'Error' | 'Not Found' | 'Blocked';
  canonicalValidationMessage?: string;
  metaKeywords?: string;
  metaKeywordsLength?: number;
  contentType?: string;
  lastModified?: string | null;
  timestamp: string;
  success?: boolean;
  sessionId?: number;
  tableCount?: number | null;
  tableData?: string | null;
  hasTables?: boolean | null;
  faqCount?: number | null;
  faqData?: string | null;
  hasFaqs?: boolean | null;
  faqScore?: number | null;
  faqDetectionMethod?: string | null;
  faqSchemaPresent?: boolean | null;
  hasMixedContent?: boolean | null;
  mixedContentSeverity?: 'none' | 'warning' | 'critical' | null;
  mixedContentData?: string | null;
  activeMixedContentCount?: number | null;
  passiveMixedContentCount?: number | null;
  totalInsecureResources?: number | null;
  headerStructureData?: string | null;
  headerStructureIssues?: string | null;
  viewportPresent?: boolean | null;
  viewportContent?: string | null;
  viewportStatus?: 'ok' | 'warning' | 'error' | 'missing' | null;
  structuredDataPresent?: boolean | null;
  structuredDataFormat?: string | null;
  structuredDataTypes?: string | null;
  structuredDataPriorityType?: string | null;
  // Page Size Measurements
  pageSizeBytes?: number | null;
  pageSizeStatus?: 'Small' | 'Medium' | 'Large' | null;
  htmlSizeBytes?: number | null;
  htmlSizeStatus?: 'Good' | 'Warning' | 'Large' | null;
  totalResourceSizeBytes?: number | null;
  resourceSizeBreakdown?: string | null; // JSON string
}

interface PageMetricsProps {
  initialSessionId: number | null;
}

// Utility function to format bytes
const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Utility function to get status color
const getStatusColor = (status: string | null | undefined): string => {
  if (!status) return '#999';
  
  switch (status.toLowerCase()) {
    case 'good':
    case 'small':
      return '#10b981'; // Green
    case 'warning':
    case 'medium':
      return '#f59e0b'; // Orange
    case 'large':
      return '#ef4444'; // Red
    default:
      return '#999';
  }
};

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
  const [selectedPage, setSelectedPage] = useState<PageMetric | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedField, setSelectedField] = useState<string>('');
  const [hoveredDuplicate, setHoveredDuplicate] = useState<{type: 'title' | 'meta', url: string} | null>(null);

  useEffect(() => {
    if (initialSessionId) {
      loadData();
    } else {
      setLoading(false);
      setData([]);
    }
  }, [initialSessionId, accessToken]);

  const loadData = async () => {
    if (!initialSessionId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      params.set('sessionId', String(initialSessionId));
      params.set('limit', '1000');
      
      const response = await authFetch(`/api/data/pages?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to load page metrics');
      }
      
      const result = await response.json();
      const pages = result.pages || [];
      
      const transformedData: PageMetric[] = pages.map((page: any) => ({
        url: page.url || '',
        title: page.title || 'No title',
        titleLength: page.titleLength,
        titlePixelWidth: page.titlePixelWidth,
        titleStatus: page.titleStatus,
        duplicateTitleCount: page.duplicateTitleCount,
        duplicateWith: page.duplicateWith,
        resourceType: page.resourceType,
        description: page.description || 'No description',
        descriptionLength: page.descriptionLength,
        descriptionPixelWidth: page.descriptionPixelWidth,
        metaDescriptionStatus: page.metaDescriptionStatus,
        duplicateMetaDescriptionCount: page.duplicateMetaDescriptionCount,
        duplicateMetaDescriptionWith: page.duplicateMetaDescriptionWith,
        canonicalUrl: page.canonicalUrl,
        canonicalValidationStatus: page.canonicalValidationStatus,
        canonicalValidationMessage: page.canonicalValidationMessage,
        metaKeywords: page.metaKeywords,
        metaKeywordsLength: page.metaKeywordsLength,
        contentType: page.contentType,
        lastModified: page.lastModified,
        timestamp: page.timestamp || page.crawledAt || '',
        success: page.success,
        sessionId: page.sessionId,
        tableCount: page.tableCount,
        tableData: page.tableData,
        hasTables: page.hasTables,
        faqCount: page.faqCount,
        faqData: page.faqData,
        hasFaqs: page.hasFaqs,
        faqScore: page.faqScore,
        faqDetectionMethod: page.faqDetectionMethod,
        faqSchemaPresent: page.faqSchemaPresent,
        hasMixedContent: page.hasMixedContent,
        mixedContentSeverity: page.mixedContentSeverity,
        mixedContentData: page.mixedContentData,
        activeMixedContentCount: page.activeMixedContentCount,
        passiveMixedContentCount: page.passiveMixedContentCount,
        totalInsecureResources: page.totalInsecureResources,
        headerStructureData: page.headerStructureData,
        headerStructureIssues: page.headerStructureIssues,
        viewportPresent: page.viewportPresent,
        viewportContent: page.viewportContent,
        viewportStatus: page.viewportStatus,
        structuredDataPresent: page.structuredDataPresent,
        structuredDataFormat: page.structuredDataFormat,
        structuredDataTypes: page.structuredDataTypes,
        structuredDataPriorityType: page.structuredDataPriorityType,
        // Page Size Measurements
        pageSizeBytes: page.pageSizeBytes,
        pageSizeStatus: page.pageSizeStatus,
        htmlSizeBytes: page.htmlSizeBytes,
        htmlSizeStatus: page.htmlSizeStatus,
        totalResourceSizeBytes: page.totalResourceSizeBytes,
        resourceSizeBreakdown: page.resourceSizeBreakdown,
      }));
      
      setData(transformedData);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
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

  const openDetailsModal = (page: PageMetric, field: string) => {
    setSelectedPage(page);
    setSelectedField(field);
    setShowDetailsModal(true);
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedPage(null);
    setSelectedField('');
  };

  const ViewDataButton = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: '4px',
        border: '1px solid rgba(102, 126, 234, 0.5)',
        background: 'rgba(102, 126, 234, 0.1)',
        color: '#667eea',
        cursor: 'pointer',
        fontSize: '11px',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
        e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.8)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';
        e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.5)';
      }}
    >
      View Data
    </button>
  );

  const filteredAndSortedData = data
    .filter(item =>
      (item.url || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.contentType || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.titleStatus || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.metaDescriptionStatus || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (aVal === null || aVal === undefined) {
        return bVal === null || bVal === undefined ? 0 : 1;
      }
      if (bVal === null || bVal === undefined) {
        return -1;
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        if (aVal === bVal) return 0;
        return sortDirection === 'asc' 
          ? (aVal ? 1 : -1) - (bVal ? 1 : -1)
          : (bVal ? 1 : -1) - (aVal ? 1 : -1);
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
      if (initialSessionId) {
        params.set('sessionId', String(initialSessionId));
      }
      
      const response = await authFetch(`/api/export?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `page-metrics.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('Export failed: ' + (err.message || 'Unknown error'));
    }
  };

  const getStatusBadge = (status: string | null | undefined, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    if (!status) return <span style={{ color: '#999' }}>—</span>;
    const badgeClass = type === 'success' ? 'success' : type === 'warning' ? 'redirect' : type === 'error' ? 'client-error' : 'unknown';
    return <span className={`status-badge ${badgeClass}`}>{status}</span>;
  };

  const getTitleStatusWithDuplicate = (item: PageMetric, index: number) => {
    if (!item.titleStatus) return <span style={{ color: '#999' }}>—</span>;
    
    const badge = getStatusBadge(item.titleStatus, item.titleStatus === 'OK' ? 'success' : item.titleStatus === 'Missing' ? 'error' : 'warning');
    
    if (item.titleStatus === 'Duplicate' && item.duplicateWith && item.duplicateWith.length > 0) {
      const tooltipId = `title-duplicate-${index}`;
      const isHovered = hoveredDuplicate?.type === 'title' && hoveredDuplicate?.url === item.url;
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
          {badge}
          <span 
            style={{ 
              cursor: 'pointer', 
              color: '#667eea', 
              fontSize: '14px',
              display: 'inline-block'
            }}
            onMouseEnter={(e) => {
              setHoveredDuplicate({ type: 'title', url: item.url });
            }}
            onMouseLeave={(e) => {
              // Small delay to allow moving to tooltip
              setTimeout(() => {
                const tooltip = document.getElementById(tooltipId);
                if (tooltip && !tooltip.matches(':hover')) {
                  setHoveredDuplicate(null);
                }
              }, 100);
            }}
          >
            👁️
          </span>
          {isHovered && (
            <div
              id={tooltipId}
              style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                marginTop: '8px',
                background: 'rgba(20, 20, 30, 0.98)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                minWidth: '300px',
                maxWidth: '500px',
                maxHeight: '300px',
                overflowY: 'auto',
                zIndex: 10000,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                whiteSpace: 'normal'
              }}
              onMouseEnter={() => setHoveredDuplicate({ type: 'title', url: item.url })}
              onMouseLeave={() => setHoveredDuplicate(null)}
            >
              <div style={{ color: '#fff', fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>
                Duplicate with ({item.duplicateWith.length} page{item.duplicateWith.length !== 1 ? 's' : ''}):
              </div>
              {item.duplicateWith.map((url, idx) => (
                <div key={idx} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: idx < item.duplicateWith!.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none' }}>
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: '#667eea', textDecoration: 'none', fontSize: '11px', wordBreak: 'break-all', lineHeight: '1.4' }}
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
      );
    }
    
    return badge;
  };

  const getMetaDescStatusWithDuplicate = (item: PageMetric, index: number) => {
    if (!item.metaDescriptionStatus) return <span style={{ color: '#999' }}>—</span>;
    
    const badge = getStatusBadge(item.metaDescriptionStatus, item.metaDescriptionStatus === 'OK' ? 'success' : item.metaDescriptionStatus === 'Missing' ? 'error' : 'warning');
    
    if (item.metaDescriptionStatus === 'Duplicate' && item.duplicateMetaDescriptionWith && item.duplicateMetaDescriptionWith.length > 0) {
      const tooltipId = `meta-desc-duplicate-${index}`;
      const isHovered = hoveredDuplicate?.type === 'meta' && hoveredDuplicate?.url === item.url;
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
          {badge}
          <span 
            style={{ 
              cursor: 'pointer', 
              color: '#667eea', 
              fontSize: '14px',
              display: 'inline-block'
            }}
            onMouseEnter={(e) => {
              setHoveredDuplicate({ type: 'meta', url: item.url });
            }}
            onMouseLeave={(e) => {
              // Small delay to allow moving to tooltip
              setTimeout(() => {
                const tooltip = document.getElementById(tooltipId);
                if (tooltip && !tooltip.matches(':hover')) {
                  setHoveredDuplicate(null);
                }
              }, 100);
            }}
          >
            👁️
          </span>
          {isHovered && (
            <div
              id={tooltipId}
              style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                marginTop: '8px',
                background: 'rgba(20, 20, 30, 0.98)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                minWidth: '300px',
                maxWidth: '500px',
                maxHeight: '300px',
                overflowY: 'auto',
                zIndex: 10000,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                whiteSpace: 'normal'
              }}
              onMouseEnter={() => setHoveredDuplicate({ type: 'meta', url: item.url })}
              onMouseLeave={() => setHoveredDuplicate(null)}
            >
              <div style={{ color: '#fff', fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>
                Duplicate with ({item.duplicateMetaDescriptionWith.length} page{item.duplicateMetaDescriptionWith.length !== 1 ? 's' : ''}):
              </div>
              {item.duplicateMetaDescriptionWith.map((url, idx) => (
                <div key={idx} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: idx < item.duplicateMetaDescriptionWith!.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none' }}>
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: '#667eea', textDecoration: 'none', fontSize: '11px', wordBreak: 'break-all', lineHeight: '1.4' }}
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
      );
    }
    
    return badge;
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
      {/* Header */}
      <div style={{ padding: '20px 30px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)' }}>
        <h2 style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.5rem' }}>
          <span>📊</span> Page Metrics
        </h2>
      </div>

      {/* Search and Export */}
      <div style={{ padding: '20px 30px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search by URL, title, description..."
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
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => exportData('json')} className="export-btn">📥 JSON</button>
          <button onClick={() => exportData('csv')} className="export-btn">📊 CSV</button>
          <button onClick={() => exportData('txt')} className="export-btn">📄 TXT</button>
          <button onClick={() => exportData('xml')} className="export-btn">📋 XML</button>
        </div>
      </div>

      {/* Summary Stats */}
      {data.length > 0 && (
        <div style={{ 
          padding: '20px 30px', 
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)', 
          background: 'rgba(0, 0, 0, 0.3)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px'
        }}>
          <div style={{ background: 'rgba(102, 126, 234, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(102, 126, 234, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Total Pages</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{data.length}</div>
          </div>
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>With Tables</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{data.filter(p => p.hasTables).length}</div>
          </div>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>With FAQs</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{data.filter(p => p.hasFaqs).length}</div>
          </div>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Mixed Content</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{data.filter(p => p.hasMixedContent).length}</div>
          </div>
          <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Structured Data</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{data.filter(p => p.structuredDataPresent).length}</div>
          </div>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Small Pages</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{data.filter(p => p.pageSizeStatus === 'Small').length}</div>
          </div>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Large Pages</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{data.filter(p => p.pageSizeStatus === 'Large').length}</div>
          </div>
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Good HTML Size</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{data.filter(p => p.htmlSizeStatus === 'Good').length}</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 30px', background: 'rgba(0, 0, 0, 0.3)' }}>
        <table className="data-table" style={{ width: '100%', background: 'transparent', color: '#fff', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '350px' }} />
            <col style={{ width: '300px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '120px' }} />
          </colgroup>
          <thead>
            <tr>
              <th onClick={() => handleSort('url')} className="sortable" style={{ padding: '12px 8px', textAlign: 'left', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                URL {sortField === 'url' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('title')} className="sortable" style={{ padding: '12px 8px', textAlign: 'left', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                TITLE {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('titleStatus')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                TITLE STATUS {sortField === 'titleStatus' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('metaDescriptionStatus')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                META DESC STATUS {sortField === 'metaDescriptionStatus' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('canonicalUrl')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                CANONICAL URL {sortField === 'canonicalUrl' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('canonicalValidationStatus')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                CANONICAL VALIDATION {sortField === 'canonicalValidationStatus' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('hasTables')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                🔹 TABLES {sortField === 'hasTables' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('hasFaqs')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                ❓ FAQS {sortField === 'hasFaqs' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('hasMixedContent')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                🔒 MIXED CONTENT {sortField === 'hasMixedContent' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('viewportStatus')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                📱 VIEWPORT {sortField === 'viewportStatus' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                📋 HEADERS
              </th>
              <th onClick={() => handleSort('structuredDataPresent')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                🏷️ STRUCTURED DATA {sortField === 'structuredDataPresent' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('pageSizeBytes')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                📊 PAGE SIZE {sortField === 'pageSizeBytes' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('htmlSizeBytes')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                📄 HTML SIZE {sortField === 'htmlSizeBytes' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('totalResourceSizeBytes')} className="sortable" style={{ padding: '12px 8px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.5)', borderBottom: '2px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                🗂️ RESOURCES {sortField === 'totalResourceSizeBytes' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {currentData.length === 0 ? (
              <tr>
                <td colSpan={15} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  {!initialSessionId ? 'No session selected' : 'No data available'}
                </td>
              </tr>
            ) : (
              currentData.map((item, index) => (
                <tr key={index} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '12px 8px', textAlign: 'left', verticalAlign: 'top', wordBreak: 'break-all', overflowWrap: 'break-word' }}>
                    <a 
                      href={item.url || '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: '#667eea', textDecoration: 'none', fontSize: '12px', display: 'block', lineHeight: '1.4' }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                    >
                      {item.url || 'No URL'}
                    </a>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'left', verticalAlign: 'top', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                    <div style={{ color: '#fff', fontSize: '12px', fontWeight: '500', lineHeight: '1.4' }}>
                      {item.title || 'No title'}
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {getTitleStatusWithDuplicate(item, index)}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {getMetaDescStatusWithDuplicate(item, index)}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'left', verticalAlign: 'top', wordBreak: 'break-all', overflowWrap: 'break-word' }}>
                    {item.canonicalUrl ? (
                      <a 
                        href={item.canonicalUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#667eea', textDecoration: 'none', fontSize: '12px', lineHeight: '1.4' }}
                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                      >
                        {item.canonicalUrl}
                      </a>
                    ) : (
                      <span style={{ color: '#999', fontSize: '12px' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {getStatusBadge(item.canonicalValidationStatus, item.canonicalValidationStatus === 'Valid' ? 'success' : item.canonicalValidationStatus === 'Missing' ? 'error' : 'warning')}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {item.hasTables ? (
                      <ViewDataButton onClick={() => openDetailsModal(item, 'tables')} />
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {item.hasFaqs ? (
                      <ViewDataButton onClick={() => openDetailsModal(item, 'faqs')} />
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {item.hasMixedContent !== null && item.hasMixedContent !== undefined ? (
                      item.hasMixedContent ? (
                        <span className={item.mixedContentSeverity === 'critical' ? 'status-badge client-error' : 'status-badge redirect'}>
                          {item.mixedContentSeverity === 'critical' ? 'Critical' : 'Warning'}
                        </span>
                      ) : (
                        <span className="status-badge success">Secure</span>
                      )
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {item.viewportStatus ? (
                      getStatusBadge(item.viewportStatus, item.viewportStatus === 'ok' ? 'success' : item.viewportStatus === 'missing' ? 'error' : 'warning')
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {item.headerStructureData ? (
                      <ViewDataButton onClick={() => openDetailsModal(item, 'headers')} />
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {item.structuredDataPresent !== null && item.structuredDataPresent !== undefined ? (
                      item.structuredDataPresent ? (
                        <span className="status-badge success" title={item.structuredDataFormat || 'Present'}>
                          {item.structuredDataFormat || 'Yes'}
                        </span>
                      ) : (
                        <span className="status-badge redirect">No</span>
                      )
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {item.pageSizeBytes !== null && item.pageSizeBytes !== undefined ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#fff' }}>
                          {formatBytes(item.pageSizeBytes)}
                        </span>
                        <span 
                          style={{ 
                            fontSize: '10px', 
                            padding: '1px 4px', 
                            borderRadius: '2px', 
                            background: getStatusColor(item.pageSizeStatus),
                            color: '#fff'
                          }}
                        >
                          {item.pageSizeStatus}
                        </span>
                        <ViewDataButton onClick={() => openDetailsModal(item, 'pageSize')} />
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {item.htmlSizeBytes !== null && item.htmlSizeBytes !== undefined ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#fff' }}>
                          {formatBytes(item.htmlSizeBytes)}
                        </span>
                        <span 
                          style={{ 
                            fontSize: '10px', 
                            padding: '1px 4px', 
                            borderRadius: '2px', 
                            background: getStatusColor(item.htmlSizeStatus),
                            color: '#fff'
                          }}
                        >
                          {item.htmlSizeStatus}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {item.totalResourceSizeBytes !== null && item.totalResourceSizeBytes !== undefined ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#fff' }}>
                          {formatBytes(item.totalResourceSizeBytes)}
                        </span>
                        <ViewDataButton onClick={() => openDetailsModal(item, 'resourceSizeBreakdown')} />
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ padding: '15px 30px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ color: '#999', fontSize: '14px' }}>
            Showing {startIndex + 1}-{Math.min(endIndex, filteredAndSortedData.length)} of {filteredAndSortedData.length} results
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: currentPage === 1 ? 'rgba(107, 114, 128, 0.2)' : 'rgba(0, 0, 0, 0.6)',
                color: '#fff',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1
              }}
            >
              Previous
            </button>
            <span style={{ color: '#999', fontSize: '14px', minWidth: '100px', textAlign: 'center' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
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
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedPage && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={closeDetailsModal}
        >
          <div 
            style={{
              background: 'rgba(20, 20, 30, 0.95)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              color: '#fff'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>
                {selectedField === 'titleStatus' && '📝 Title Status'}
                {selectedField === 'duplicateTitle' && '📝 Duplicate Title'}
                {selectedField === 'metaDescriptionStatus' && '📝 Meta Description Status'}
                {selectedField === 'duplicateMetaDescription' && '📝 Duplicate Meta Description'}
                {selectedField === 'canonicalUrl' && '🔗 Canonical URL'}
                {selectedField === 'canonicalValidation' && '✅ Canonical Validation'}
                {selectedField === 'tables' && '🔹 Tables'}
                {selectedField === 'faqs' && '❓ FAQs'}
                {selectedField === 'mixedContent' && '🔒 Mixed Content'}
                {selectedField === 'viewport' && '📱 Viewport'}
                {selectedField === 'headers' && '📋 Headers'}
                {selectedField === 'structuredData' && '🏷️ Structured Data'}
                {selectedField === 'pageSize' && '📊 Page Size Measurements'}
                {selectedField === 'resourceSizeBreakdown' && '🗂️ Resource Size Breakdown'}
              </h3>
              <button
                onClick={closeDetailsModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px' }}>
              {/* URL Reference */}
              <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <div style={{ color: '#999', fontSize: '12px', marginBottom: '5px' }}>Page URL</div>
                <a 
                  href={selectedPage.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: '#667eea', textDecoration: 'none', wordBreak: 'break-all', fontSize: '13px' }}
                >
                  {selectedPage.url}
                </a>
              </div>

              {/* Field-specific content */}
              {selectedField === 'titleStatus' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Status</div>
                    {getStatusBadge(selectedPage.titleStatus, selectedPage.titleStatus === 'OK' ? 'success' : selectedPage.titleStatus === 'Missing' ? 'error' : 'warning')}
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Title</div>
                    <div style={{ color: '#fff', padding: '10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px' }}>
                      {selectedPage.title || 'No title'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
                    <div>
                      <div style={{ color: '#999', marginBottom: '5px' }}>Length</div>
                      <div style={{ color: '#fff' }}>{selectedPage.titleLength || 0} characters</div>
                    </div>
                    {selectedPage.titlePixelWidth && (
                      <div>
                        <div style={{ color: '#999', marginBottom: '5px' }}>Pixel Width</div>
                        <div style={{ color: '#fff' }}>{selectedPage.titlePixelWidth}px</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedField === 'duplicateTitle' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Duplicate Count</div>
                    <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>
                      {selectedPage.duplicateTitleCount || 0}
                    </div>
                  </div>
                  {selectedPage.duplicateWith && selectedPage.duplicateWith.length > 0 && (
                    <div>
                      <div style={{ color: '#999', marginBottom: '10px' }}>Duplicate With ({selectedPage.duplicateWith.length} pages)</div>
                      <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '6px' }}>
                        {selectedPage.duplicateWith.map((url, idx) => (
                          <div key={idx} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: idx < selectedPage.duplicateWith!.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none' }}>
                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', textDecoration: 'none', wordBreak: 'break-all', fontSize: '12px' }}>
                              {url}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedField === 'metaDescriptionStatus' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Status</div>
                    {getStatusBadge(selectedPage.metaDescriptionStatus, selectedPage.metaDescriptionStatus === 'OK' ? 'success' : selectedPage.metaDescriptionStatus === 'Missing' ? 'error' : 'warning')}
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Description</div>
                    <div style={{ color: '#fff', padding: '10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px' }}>
                      {selectedPage.description || 'No description'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
                    <div>
                      <div style={{ color: '#999', marginBottom: '5px' }}>Length</div>
                      <div style={{ color: '#fff' }}>{selectedPage.descriptionLength || 0} characters</div>
                    </div>
                    {selectedPage.descriptionPixelWidth && (
                      <div>
                        <div style={{ color: '#999', marginBottom: '5px' }}>Pixel Width</div>
                        <div style={{ color: '#fff' }}>{selectedPage.descriptionPixelWidth}px</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedField === 'duplicateMetaDescription' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Duplicate Count</div>
                    <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>
                      {selectedPage.duplicateMetaDescriptionCount || 0}
                    </div>
                  </div>
                  {selectedPage.duplicateMetaDescriptionWith && selectedPage.duplicateMetaDescriptionWith.length > 0 && (
                    <div>
                      <div style={{ color: '#999', marginBottom: '10px' }}>Duplicate With ({selectedPage.duplicateMetaDescriptionWith.length} pages)</div>
                      <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '6px' }}>
                        {selectedPage.duplicateMetaDescriptionWith.map((url, idx) => (
                          <div key={idx} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: idx < selectedPage.duplicateMetaDescriptionWith!.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none' }}>
                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', textDecoration: 'none', wordBreak: 'break-all', fontSize: '12px' }}>
                              {url}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedField === 'canonicalUrl' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Canonical URL</div>
                    {selectedPage.canonicalUrl ? (
                      <a 
                        href={selectedPage.canonicalUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#667eea', textDecoration: 'none', wordBreak: 'break-all', padding: '10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', display: 'block' }}
                      >
                        {selectedPage.canonicalUrl}
                      </a>
                    ) : (
                      <div style={{ color: '#999', padding: '10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px' }}>No canonical URL specified</div>
                    )}
                  </div>
                </div>
              )}

              {selectedField === 'canonicalValidation' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Validation Status</div>
                    {getStatusBadge(selectedPage.canonicalValidationStatus, selectedPage.canonicalValidationStatus === 'Valid' ? 'success' : selectedPage.canonicalValidationStatus === 'Missing' ? 'error' : 'warning')}
                  </div>
                  {selectedPage.canonicalValidationMessage && (
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ color: '#999', marginBottom: '8px' }}>Message</div>
                      <div style={{ color: '#fff', padding: '10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px' }}>
                        {selectedPage.canonicalValidationMessage}
                      </div>
                    </div>
                  )}
                  {selectedPage.canonicalUrl && (
                    <div>
                      <div style={{ color: '#999', marginBottom: '8px' }}>Canonical URL</div>
                      <a 
                        href={selectedPage.canonicalUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#667eea', textDecoration: 'none', wordBreak: 'break-all', fontSize: '12px' }}
                      >
                        {selectedPage.canonicalUrl}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {selectedField === 'tables' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Has Tables</div>
                    <div style={{ color: '#fff' }}>{selectedPage.hasTables ? 'Yes' : 'No'}</div>
                  </div>
                  {selectedPage.hasTables && (
                    <>
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{ color: '#999', marginBottom: '8px' }}>Table Count</div>
                        <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{selectedPage.tableCount || 0}</div>
                      </div>
                      {selectedPage.tableData && (
                        <div>
                          <div style={{ color: '#999', marginBottom: '10px' }}>Table Data</div>
                          <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'rgba(0, 0, 0, 0.3)', padding: '15px', borderRadius: '6px' }}>
                            <pre style={{ color: '#fff', fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {(() => {
                                try {
                                  const parsed = typeof selectedPage.tableData === 'string' ? JSON.parse(selectedPage.tableData) : selectedPage.tableData;
                                  return JSON.stringify(parsed, null, 2);
                                } catch {
                                  return selectedPage.tableData;
                                }
                              })()}
                            </pre>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {selectedField === 'faqs' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Has FAQs</div>
                    <div style={{ color: '#fff' }}>{selectedPage.hasFaqs ? 'Yes' : 'No'}</div>
                  </div>
                  {selectedPage.hasFaqs && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '15px' }}>
                        <div>
                          <div style={{ color: '#999', marginBottom: '5px' }}>FAQ Count</div>
                          <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{selectedPage.faqCount || 0}</div>
                        </div>
                        <div>
                          <div style={{ color: '#999', marginBottom: '5px' }}>FAQ Score</div>
                          <div style={{ color: '#fff' }}>{selectedPage.faqScore || 0}/10</div>
                        </div>
                        <div>
                          <div style={{ color: '#999', marginBottom: '5px' }}>Detection Method</div>
                          <div style={{ color: '#fff' }}>{selectedPage.faqDetectionMethod || '—'}</div>
                        </div>
                        <div>
                          <div style={{ color: '#999', marginBottom: '5px' }}>Schema Present</div>
                          <div style={{ color: '#fff' }}>{selectedPage.faqSchemaPresent ? 'Yes' : 'No'}</div>
                        </div>
                      </div>
                      {selectedPage.faqData && (
                        <div>
                          <div style={{ color: '#999', marginBottom: '10px' }}>FAQ Data</div>
                          <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'rgba(0, 0, 0, 0.3)', padding: '15px', borderRadius: '6px' }}>
                            <pre style={{ color: '#fff', fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {(() => {
                                try {
                                  const parsed = typeof selectedPage.faqData === 'string' ? JSON.parse(selectedPage.faqData) : selectedPage.faqData;
                                  return JSON.stringify(parsed, null, 2);
                                } catch {
                                  return selectedPage.faqData;
                                }
                              })()}
                            </pre>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {selectedField === 'mixedContent' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Has Mixed Content</div>
                    <div style={{ color: '#fff' }}>{selectedPage.hasMixedContent ? 'Yes' : 'No'}</div>
                  </div>
                  {selectedPage.hasMixedContent && (
                    <>
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{ color: '#999', marginBottom: '8px' }}>Severity</div>
                        <span className={selectedPage.mixedContentSeverity === 'critical' ? 'status-badge client-error' : 'status-badge redirect'}>
                          {selectedPage.mixedContentSeverity === 'critical' ? 'Critical' : 'Warning'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '15px' }}>
                        <div>
                          <div style={{ color: '#999', marginBottom: '5px' }}>Active Resources</div>
                          <div style={{ color: '#fff' }}>{selectedPage.activeMixedContentCount || 0}</div>
                        </div>
                        <div>
                          <div style={{ color: '#999', marginBottom: '5px' }}>Passive Resources</div>
                          <div style={{ color: '#fff' }}>{selectedPage.passiveMixedContentCount || 0}</div>
                        </div>
                        <div>
                          <div style={{ color: '#999', marginBottom: '5px' }}>Total Insecure</div>
                          <div style={{ color: '#fff' }}>{selectedPage.totalInsecureResources || 0}</div>
                        </div>
                      </div>
                      {selectedPage.mixedContentData && (
                        <div>
                          <div style={{ color: '#999', marginBottom: '10px' }}>Mixed Content Details</div>
                          <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'rgba(0, 0, 0, 0.3)', padding: '15px', borderRadius: '6px' }}>
                            <pre style={{ color: '#fff', fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {(() => {
                                try {
                                  const parsed = typeof selectedPage.mixedContentData === 'string' ? JSON.parse(selectedPage.mixedContentData) : selectedPage.mixedContentData;
                                  return JSON.stringify(parsed, null, 2);
                                } catch {
                                  return selectedPage.mixedContentData;
                                }
                              })()}
                            </pre>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {selectedField === 'viewport' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Viewport Present</div>
                    <div style={{ color: '#fff' }}>{selectedPage.viewportPresent ? 'Yes' : 'No'}</div>
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Status</div>
                    {getStatusBadge(selectedPage.viewportStatus, selectedPage.viewportStatus === 'ok' ? 'success' : selectedPage.viewportStatus === 'missing' ? 'error' : 'warning')}
                  </div>
                  {selectedPage.viewportContent && (
                    <div>
                      <div style={{ color: '#999', marginBottom: '8px' }}>Viewport Content</div>
                      <div style={{ color: '#fff', padding: '10px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px' }}>
                        {selectedPage.viewportContent}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedField === 'headers' && (
                <div style={{ fontSize: '14px' }}>
                  {selectedPage.headerStructureData && (
                    <>
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{ color: '#999', marginBottom: '10px' }}>Header Structure</div>
                        <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'rgba(0, 0, 0, 0.3)', padding: '15px', borderRadius: '6px' }}>
                          <pre style={{ color: '#fff', fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {(() => {
                              try {
                                const parsed = typeof selectedPage.headerStructureData === 'string' ? JSON.parse(selectedPage.headerStructureData) : selectedPage.headerStructureData;
                                return JSON.stringify(parsed, null, 2);
                              } catch {
                                return selectedPage.headerStructureData;
                              }
                            })()}
                          </pre>
                        </div>
                      </div>
                      {selectedPage.headerStructureIssues && (
                        <div>
                          <div style={{ color: '#999', marginBottom: '10px' }}>Issues</div>
                          <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0, 0, 0, 0.3)', padding: '15px', borderRadius: '6px' }}>
                            <pre style={{ color: '#fff', fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {(() => {
                                try {
                                  const parsed = typeof selectedPage.headerStructureIssues === 'string' ? JSON.parse(selectedPage.headerStructureIssues) : selectedPage.headerStructureIssues;
                                  return JSON.stringify(parsed, null, 2);
                                } catch {
                                  return selectedPage.headerStructureIssues;
                                }
                              })()}
                            </pre>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {!selectedPage.headerStructureData && (
                    <div style={{ color: '#999' }}>No header structure data available</div>
                  )}
                </div>
              )}

              {selectedField === 'structuredData' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Structured Data Present</div>
                    <div style={{ color: '#fff' }}>{selectedPage.structuredDataPresent ? 'Yes' : 'No'}</div>
                  </div>
                  {selectedPage.structuredDataPresent && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '15px' }}>
                        <div>
                          <div style={{ color: '#999', marginBottom: '5px' }}>Format</div>
                          <div style={{ color: '#fff' }}>{selectedPage.structuredDataFormat || '—'}</div>
                        </div>
                        <div>
                          <div style={{ color: '#999', marginBottom: '5px' }}>Priority Type</div>
                          <div style={{ color: '#fff' }}>{selectedPage.structuredDataPriorityType || '—'}</div>
                        </div>
                      </div>
                      {selectedPage.structuredDataTypes && (
                        <div>
                          <div style={{ color: '#999', marginBottom: '10px' }}>Types</div>
                          <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0, 0, 0, 0.3)', padding: '15px', borderRadius: '6px' }}>
                            <pre style={{ color: '#fff', fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {(() => {
                                try {
                                  const parsed = typeof selectedPage.structuredDataTypes === 'string' ? JSON.parse(selectedPage.structuredDataTypes) : selectedPage.structuredDataTypes;
                                  return JSON.stringify(parsed, null, 2);
                                } catch {
                                  return selectedPage.structuredDataTypes;
                                }
                              })()}
                            </pre>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {selectedField === 'pageSize' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '15px' }}>
                    <div>
                      <div style={{ color: '#999', marginBottom: '5px' }}>Total Page Size</div>
                      <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{formatBytes(selectedPage.pageSizeBytes)}</div>
                      <div style={{ 
                        fontSize: '12px', 
                        padding: '2px 6px', 
                        borderRadius: '3px', 
                        background: getStatusColor(selectedPage.pageSizeStatus),
                        color: '#fff',
                        display: 'inline-block',
                        marginTop: '5px'
                      }}>
                        {selectedPage.pageSizeStatus}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#999', marginBottom: '5px' }}>HTML Size</div>
                      <div style={{ color: '#fff', fontSize: '16px', fontWeight: '500' }}>{formatBytes(selectedPage.htmlSizeBytes)}</div>
                      <div style={{ color: '#999', fontSize: '11px', marginTop: '2px' }}>
                        {selectedPage.htmlSizeStatus} ({Math.round((selectedPage.htmlSizeBytes || 0) / (selectedPage.pageSizeBytes || 1) * 100)}% of total)
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '5px' }}>Total Resource Size</div>
                    <div style={{ color: '#fff', fontSize: '16px', fontWeight: '500' }}>{formatBytes(selectedPage.totalResourceSizeBytes)}</div>
                    <div style={{ color: '#999', fontSize: '11px', marginTop: '2px' }}>
                      {Math.round((selectedPage.totalResourceSizeBytes || 0) / (selectedPage.pageSizeBytes || 1) * 100)}% of total page size
                    </div>
                  </div>
                  {selectedPage.resourceSizeBreakdown && (
                    <div>
                      <div style={{ color: '#999', marginBottom: '10px' }}>Resource Breakdown</div>
                      <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '15px', borderRadius: '6px' }}>
                        {(() => {
                          try {
                            const breakdown = JSON.parse(selectedPage.resourceSizeBreakdown!);
                            return (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                                {Object.entries(breakdown).map(([type, size]) => (
                                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#999', textTransform: 'capitalize' }}>{type}:</span>
                                    <span style={{ color: '#fff', fontWeight: '500' }}>{formatBytes(size as number)}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          } catch {
                            return <pre style={{ color: '#fff', fontSize: '12px', margin: 0 }}>{selectedPage.resourceSizeBreakdown}</pre>;
                          }
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedField === 'resourceSizeBreakdown' && (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ color: '#999', marginBottom: '8px' }}>Total Resource Size</div>
                    <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{formatBytes(selectedPage.totalResourceSizeBytes)}</div>
                  </div>
                  {selectedPage.resourceSizeBreakdown ? (
                    <div>
                      <div style={{ color: '#999', marginBottom: '10px' }}>Breakdown by Type</div>
                      <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '15px', borderRadius: '6px' }}>
                        {(() => {
                          try {
                            const breakdown = JSON.parse(selectedPage.resourceSizeBreakdown!);
                            const total = Object.values(breakdown).reduce((sum: number, size) => sum + (size as number), 0);
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {Object.entries(breakdown)
                                  .sort(([, a], [, b]) => (b as number) - (a as number))
                                  .map(([type, size]) => {
                                    const percentage = total > 0 ? Math.round((size as number) / total * 100) : 0;
                                    return (
                                      <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ color: '#fff', textTransform: 'capitalize', fontWeight: '500' }}>{type}</span>
                                          <span style={{ color: '#fff' }}>{formatBytes(size as number)} ({percentage}%)</span>
                                        </div>
                                        <div style={{ 
                                          height: '4px', 
                                          background: 'rgba(255,255,255,0.1)', 
                                          borderRadius: '2px',
                                          overflow: 'hidden'
                                        }}>
                                          <div style={{ 
                                            height: '100%', 
                                            width: `${percentage}%`, 
                                            background: getStatusColor('good'),
                                            transition: 'width 0.3s ease'
                                          }} />
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            );
                          } catch {
                            return <pre style={{ color: '#fff', fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap' }}>{selectedPage.resourceSizeBreakdown}</pre>;
                          }
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#999' }}>No resource breakdown data available</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PageMetrics;
