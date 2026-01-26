import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import '../../pages/DataViewer.css';

interface PageData {
  url: string;
}

interface RedirectHop {
  url: string;
  statusCode: number;
  redirectType: '301' | '302' | '307' | '308' | null;
  redirectUrl: string | null;
  headers: Record<string, string>;
}

interface RedirectAuditResult {
  originalUrl: string;
  finalUrl: string;
  finalStatusCode: number;
  has301Redirect: boolean;
  has302Redirect: boolean;
  has307Redirect: boolean;
  redirectChain: RedirectHop[];
  chainLength: number;
  hasRedirectChain: boolean;
  hasRedirectLoop: boolean;
  loopDetectedAt?: string;
  finalUrlStatus: 'ok' | 'broken' | 'server_error' | 'unreachable';
  finalUrlStatusCode: number;
  isBrokenRedirect: boolean;
  brokenReason?: string;
  canonicalUrl?: string;
  canonicalAlignment: 'match' | 'mismatch' | 'not_found' | 'error';
  canonicalMismatchReason?: string;
  overallStatus: 'ok' | 'warning' | 'error';
  issues: string[];
}

interface AuditSummary {
  totalChecked: number;
  total301Redirects: number;
  total302Redirects: number;
  total307Redirects: number;
  totalRedirectChains: number;
  totalRedirectLoops: number;
  totalBrokenRedirects: number;
  totalCanonicalMismatches: number;
  totalOk: number;
  totalWarnings: number;
  totalErrors: number;
}

interface AuditResponse {
  success: boolean;
  sessionId: number;
  summary: AuditSummary;
  results: RedirectAuditResult[];
}

interface AuditCheckerProps {
  initialSessionId: number | null;
}

const AuditChecker: React.FC<AuditCheckerProps> = ({ initialSessionId }) => {
  const { accessToken, authFetch } = useAuth();
  const [data, setData] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  
  // Audit checking state
  const [checking, setChecking] = useState(false);
  const [auditData, setAuditData] = useState<AuditResponse | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});
  
  // Pagination for left panel
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const loadData = async () => {
    if (!initialSessionId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      params.set('sessionId', String(initialSessionId));
      params.set('limit', '1000');
      
      const response = await authFetch(`/api/data/pages?${params.toString()}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`Failed to load pages: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      const pages = result.pages || [];
      
      const transformedData: PageData[] = pages.map((page: any) => ({
        url: page.url || ''
      }));
      
      setData(transformedData);
      
      if (transformedData.length > 0 && !selectedUrl) {
        setSelectedUrl(transformedData[0].url);
      }
    } catch (err: any) {
      console.error('Error loading pages:', err);
      setError(err.message || 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [initialSessionId]);

  // Reset pagination when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredData = data.filter(item =>
    (item.url || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination calculations
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageData = filteredData.slice(startIndex, endIndex);

  const handleCheckAudit = async () => {
    if (!initialSessionId) {
      setCheckError('No session selected');
      return;
    }

    setChecking(true);
    setCheckError(null);
    setAuditData(null);

    try {
      const response = await authFetch(`/api/audit-checker/check/${initialSessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to check audit: ${response.status} ${errorText}`);
      }

      const result: AuditResponse = await response.json();
      setAuditData(result);
    } catch (err: any) {
      console.error('Error checking audit:', err);
      setCheckError(err.message || 'Failed to check audit');
    } finally {
      setChecking(false);
    }
  };

  const getStatusColor = (status: 'ok' | 'warning' | 'error'): string => {
    switch (status) {
      case 'ok': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#999';
    }
  };

  const getStatusBgColor = (status: 'ok' | 'warning' | 'error'): string => {
    switch (status) {
      case 'ok': return 'rgba(16, 185, 129, 0.1)';
      case 'warning': return 'rgba(245, 158, 11, 0.1)';
      case 'error': return 'rgba(239, 68, 68, 0.1)';
      default: return 'rgba(107, 114, 128, 0.1)';
    }
  };

  const getStatusBorderColor = (status: 'ok' | 'warning' | 'error'): string => {
    switch (status) {
      case 'ok': return 'rgba(16, 185, 129, 0.3)';
      case 'warning': return 'rgba(245, 158, 11, 0.3)';
      case 'error': return 'rgba(239, 68, 68, 0.3)';
      default: return 'rgba(107, 114, 128, 0.3)';
    }
  };

  if (loading && data.length === 0) {
    return (
      <div className="data-viewer" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="loading">Loading pages...</div>
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
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 30px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', flexShrink: 0 }}>
        <h2 style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.5rem' }}>
          <span>🔍</span> Audit Checker
        </h2>
      </div>

      {/* Search */}
      <div style={{ padding: '20px 30px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search by URL..."
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
      </div>

      {/* Two Panel Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'rgba(0, 0, 0, 0.3)', minHeight: 0 }}>
        {/* Left Panel - URLs List */}
        <div style={{ 
          width: '400px', 
          minWidth: '300px',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)', 
          display: 'flex', 
          flexDirection: 'column',
          background: 'rgba(0, 0, 0, 0.2)',
          height: '100%',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '15px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', flexShrink: 0 }}>
            <h3 style={{ color: '#fff', margin: 0, fontSize: '14px', fontWeight: '600' }}>
              URLs ({filteredData.length})
            </h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', minHeight: 0 }}>
            {currentPageData.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                {!initialSessionId ? 'No session selected' : 'No URLs found'}
              </div>
            ) : (
              currentPageData.map((item, index) => {
                const result = auditData?.results.find(r => r.originalUrl === item.url);
                const statusColor = result ? getStatusColor(result.overallStatus) : '#999';
                
                return (
                  <div
                    key={startIndex + index}
                    onClick={() => setSelectedUrl(item.url)}
                    style={{
                      padding: '12px 15px',
                      marginBottom: '8px',
                      borderRadius: '6px',
                      background: selectedUrl === item.url 
                        ? 'rgba(102, 126, 234, 0.3)' 
                        : 'rgba(255, 255, 255, 0.05)',
                      border: selectedUrl === item.url 
                        ? '1px solid rgba(102, 126, 234, 0.5)' 
                        : `1px solid ${statusColor}40`,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      wordBreak: 'break-all',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedUrl !== item.url) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedUrl !== item.url) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      {result && (
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: statusColor,
                          flexShrink: 0
                        }} />
                      )}
                      <div style={{ 
                        color: selectedUrl === item.url ? '#fff' : '#ccc', 
                        fontSize: '12px',
                        fontWeight: selectedUrl === item.url ? '500' : '400',
                        lineHeight: '1.5',
                        flex: 1
                      }}>
                        {item.url}
                      </div>
                    </div>
                    {result && (
                      <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                        {result.overallStatus.toUpperCase()} • {result.chainLength} hop{result.chainLength !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ 
              padding: '15px 20px', 
              borderTop: '1px solid rgba(255, 255, 255, 0.1)', 
              background: 'rgba(0, 0, 0, 0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: currentPage === 1 ? 'rgba(107, 114, 128, 0.2)' : 'rgba(0, 0, 0, 0.6)',
                  color: '#fff',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1,
                  fontSize: '12px'
                }}
              >
                Previous
              </button>
              <span style={{ color: '#fff', fontSize: '12px' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: currentPage === totalPages ? 'rgba(107, 114, 128, 0.2)' : 'rgba(0, 0, 0, 0.6)',
                  color: '#fff',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                  fontSize: '12px'
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Right Panel - Audit Results */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'rgba(0, 0, 0, 0.1)',
          height: '100%'
        }}>
          {/* Check Audit Button */}
          <div style={{ 
            padding: '20px 30px', 
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)', 
            background: 'rgba(0, 0, 0, 0.3)',
            flexShrink: 0
          }}>
            <button
              onClick={handleCheckAudit}
              disabled={checking || !initialSessionId}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: '8px',
                border: 'none',
                background: checking || !initialSessionId 
                  ? 'rgba(107, 114, 128, 0.3)' 
                  : '#667eea',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '600',
                cursor: checking || !initialSessionId ? 'not-allowed' : 'pointer',
                opacity: checking || !initialSessionId ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!checking && initialSessionId) {
                  e.currentTarget.style.background = '#5568d3';
                }
              }}
              onMouseLeave={(e) => {
                if (!checking && initialSessionId) {
                  e.currentTarget.style.background = '#667eea';
                }
              }}
            >
              {checking ? 'Checking Audit...' : 'check audit'}
            </button>
          </div>

          {/* Results Section */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '20px 30px',
            minHeight: 0
          }}>
            {checkError && (
              <div style={{
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                color: '#ef4444',
                fontSize: '14px',
                marginBottom: '20px'
              }}>
                Error: {checkError}
              </div>
            )}

            {auditData && auditData.results && auditData.results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Summary Statistics */}
                {(auditData.summary.totalChecked !== undefined || auditData.summary.totalChecked !== undefined) && (
                  <div style={{
                    padding: '16px',
                    background: 'rgba(102, 126, 234, 0.1)',
                    border: '1px solid rgba(102, 126, 234, 0.3)',
                    borderRadius: '8px',
                    marginBottom: '8px'
                  }}>
                    <div style={{ color: '#667eea', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                      Summary
                    </div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      {auditData.summary.totalChecked !== undefined && (
                        <div>
                          <span style={{ color: '#999', fontSize: '12px' }}>Checked: </span>
                          <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
                            {auditData.summary.totalChecked}
                          </span>
                        </div>
                      )}
                      <div>
                        <span style={{ color: '#999', fontSize: '12px' }}>Total Issues: </span>
                        <span style={{ color: '#ef4444', fontSize: '14px', fontWeight: '600' }}>
                          {auditData.summary.total301Redirects + 
                           auditData.summary.total302Redirects + 
                           auditData.summary.total307Redirects + 
                           auditData.summary.totalRedirectChains + 
                           auditData.summary.totalRedirectLoops + 
                           auditData.summary.totalBrokenRedirects + 
                           auditData.summary.totalCanonicalMismatches}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Field-based Results */}
                {([
                  { 
                    key: '301_redirects', 
                    title: 'Detect 301 Redirects', 
                    icon: '🔹', 
                    color: '#10b981',
                    filter: (r: RedirectAuditResult) => r.has301Redirect,
                    getData: (r: RedirectAuditResult) => ({
                      url: r.originalUrl,
                      finalUrl: r.finalUrl,
                      redirectChain: r.redirectChain.filter(h => h.redirectType === '301')
                    })
                  },
                  { 
                    key: '302_redirects', 
                    title: 'Detect 302 Redirects', 
                    icon: '🔹', 
                    color: '#f59e0b',
                    filter: (r: RedirectAuditResult) => r.has302Redirect,
                    getData: (r: RedirectAuditResult) => ({
                      url: r.originalUrl,
                      finalUrl: r.finalUrl,
                      redirectChain: r.redirectChain.filter(h => h.redirectType === '302')
                    })
                  },
                  { 
                    key: '307_redirects', 
                    title: 'Detect 307 Redirects', 
                    icon: '🔹', 
                    color: '#f59e0b',
                    filter: (r: RedirectAuditResult) => r.has307Redirect,
                    getData: (r: RedirectAuditResult) => ({
                      url: r.originalUrl,
                      finalUrl: r.finalUrl,
                      redirectChain: r.redirectChain.filter(h => h.redirectType === '307')
                    })
                  },
                  { 
                    key: 'redirect_chains', 
                    title: 'Identify Redirect Chains', 
                    icon: '🔗', 
                    color: '#f59e0b',
                    filter: (r: RedirectAuditResult) => r.hasRedirectChain,
                    getData: (r: RedirectAuditResult) => ({
                      url: r.originalUrl,
                      finalUrl: r.finalUrl,
                      chainLength: r.chainLength,
                      redirectChain: r.redirectChain
                    })
                  },
                  { 
                    key: 'redirect_loops', 
                    title: 'Identify Redirect Loops', 
                    icon: '⚠️', 
                    color: '#ef4444',
                    filter: (r: RedirectAuditResult) => r.hasRedirectLoop,
                    getData: (r: RedirectAuditResult) => ({
                      url: r.originalUrl,
                      loopDetectedAt: r.loopDetectedAt,
                      redirectChain: r.redirectChain
                    })
                  },
                  { 
                    key: 'final_url_status', 
                    title: 'Check HTTP Status Code of Final URL', 
                    icon: '🎯', 
                    color: '#667eea',
                    filter: (r: RedirectAuditResult) => true, // Show all
                    getData: (r: RedirectAuditResult) => ({
                      url: r.originalUrl,
                      finalUrl: r.finalUrl,
                      finalStatusCode: r.finalUrlStatusCode,
                      finalUrlStatus: r.finalUrlStatus
                    })
                  },
                  { 
                    key: 'broken_redirects', 
                    title: 'Identify Broken Redirects', 
                    icon: '❌', 
                    color: '#ef4444',
                    filter: (r: RedirectAuditResult) => r.isBrokenRedirect,
                    getData: (r: RedirectAuditResult) => ({
                      url: r.originalUrl,
                      finalUrl: r.finalUrl,
                      finalStatusCode: r.finalUrlStatusCode,
                      brokenReason: r.brokenReason
                    })
                  },
                  { 
                    key: 'canonical_alignment', 
                    title: 'Verify Canonical URL Alignment', 
                    icon: '🔗', 
                    color: '#f59e0b',
                    filter: (r: RedirectAuditResult) => r.canonicalUrl !== undefined && r.canonicalAlignment !== 'match',
                    getData: (r: RedirectAuditResult) => ({
                      url: r.originalUrl,
                      finalUrl: r.finalUrl,
                      canonicalUrl: r.canonicalUrl,
                      canonicalAlignment: r.canonicalAlignment,
                      canonicalMismatchReason: r.canonicalMismatchReason
                    })
                  }
                ] as const).map(({ key, title, icon, color, filter, getData }) => {
                  const matchingResults = auditData.results.filter(filter);
                  const isExpanded = expandedResults[key] || false;
                  const hasIssues = matchingResults.length > 0;
                  
                  return (
                    <div
                      key={key}
                      style={{
                        padding: '18px',
                        background: hasIssues ? `rgba(${color === '#10b981' ? '16, 185, 129' : color === '#f59e0b' ? '245, 158, 11' : color === '#ef4444' ? '239, 68, 68' : '102, 126, 234'}, 0.1)` : 'rgba(0, 0, 0, 0.3)',
                        border: `1px solid ${hasIssues ? color : 'rgba(255, 255, 255, 0.1)'}`,
                        borderRadius: '8px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          cursor: hasIssues ? 'pointer' : 'default'
                        }}
                        onClick={() => hasIssues && setExpandedResults(prev => ({ ...prev, [key]: !prev[key] }))}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                          <span style={{ fontSize: '18px' }}>{icon}</span>
                          <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>
                            {title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ 
                            color: hasIssues ? color : '#10b981',
                            fontSize: '14px',
                            fontWeight: '600',
                            padding: '4px 12px',
                            background: hasIssues ? `${color}20` : 'rgba(16, 185, 129, 0.2)',
                            borderRadius: '12px'
                          }}>
                            {hasIssues ? `${matchingResults.length} found` : '✓ Done'}
                          </span>
                          {hasIssues && (
                            <span style={{ color: '#999', fontSize: '12px' }}>
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          )}
                        </div>
                      </div>
                      {hasIssues && isExpanded && (
                        <div style={{ 
                          marginTop: '16px', 
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                          maxHeight: '400px',
                          overflowY: 'auto'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {matchingResults.map((result, idx) => {
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    padding: '12px',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)'
                                  }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Original URL */}
                                    <div style={{ 
                                      padding: '10px', 
                                      background: 'rgba(102, 126, 234, 0.1)', 
                                      borderRadius: '6px',
                                      border: '1px solid rgba(102, 126, 234, 0.3)'
                                    }}>
                                      <div style={{ 
                                        fontSize: '11px', 
                                        color: '#667eea', 
                                        fontWeight: '600',
                                        marginBottom: '6px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                      }}>
                                        📄 Original URL:
                                      </div>
                                      <a
                                        href={result.originalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          color: '#93c5fd',
                                          fontSize: '12px',
                                          textDecoration: 'none',
                                          wordBreak: 'break-all',
                                          display: 'block'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.color = '#667eea';
                                          e.currentTarget.style.textDecoration = 'underline';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.color = '#93c5fd';
                                          e.currentTarget.style.textDecoration = 'none';
                                        }}
                                      >
                                        {result.originalUrl}
                                      </a>
                                    </div>

                                    {/* Field-specific data */}
                                    {(key === '301_redirects' || key === '302_redirects' || key === '307_redirects') && (
                                      <>
                                        <div style={{ 
                                          padding: '10px', 
                                          background: 'rgba(239, 68, 68, 0.1)', 
                                          borderRadius: '6px',
                                          border: '1px solid rgba(239, 68, 68, 0.3)'
                                        }}>
                                          <div style={{ 
                                            fontSize: '11px', 
                                            color: '#ef4444', 
                                            fontWeight: '600',
                                            marginBottom: '6px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                          }}>
                                            🔗 Redirect Type: {key === '301_redirects' ? '301' : key === '302_redirects' ? '302' : '307'}
                                          </div>
                                          <div style={{ color: '#ccc', fontSize: '12px', wordBreak: 'break-all' }}>
                                            Final URL: {'finalUrl' in result ? result.finalUrl : 'N/A'}
                                          </div>
                                          {'redirectChain' in result && result.redirectChain && result.redirectChain.length > 0 && (
                                            <div style={{ marginTop: '8px', fontSize: '11px', color: '#999' }}>
                                              Chain: {result.redirectChain.filter((h: RedirectHop) => h.redirectType === (key === '301_redirects' ? '301' : key === '302_redirects' ? '302' : '307')).map((h: RedirectHop) => h.url).join(' → ')}
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}

                                    {key === 'redirect_chains' && (
                                      <>
                                        <div style={{ 
                                          padding: '10px', 
                                          background: 'rgba(245, 158, 11, 0.1)', 
                                          borderRadius: '6px',
                                          border: '1px solid rgba(245, 158, 11, 0.3)'
                                        }}>
                                          <div style={{ 
                                            fontSize: '11px', 
                                            color: '#f59e0b', 
                                            fontWeight: '600',
                                            marginBottom: '6px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                          }}>
                                            🔗 Redirect Chain ({'chainLength' in result ? result.chainLength : 0} hop{('chainLength' in result ? result.chainLength : 0) !== 1 ? 's' : ''})
                                          </div>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                                            {'redirectChain' in result && result.redirectChain && result.redirectChain.map((hop: RedirectHop, hopIdx: number) => (
                                              <div key={hopIdx} style={{ fontSize: '11px', color: '#ccc', wordBreak: 'break-all' }}>
                                                {hopIdx + 1}. {hop.url} {hop.redirectType && `(${hop.redirectType})`} {hop.redirectUrl && `→ ${hop.redirectUrl}`}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </>
                                    )}

                                    {key === 'redirect_loops' && (
                                      <>
                                        <div style={{ 
                                          padding: '10px', 
                                          background: 'rgba(239, 68, 68, 0.1)', 
                                          borderRadius: '6px',
                                          border: '1px solid rgba(239, 68, 68, 0.3)'
                                        }}>
                                          <div style={{ 
                                            fontSize: '11px', 
                                            color: '#ef4444', 
                                            fontWeight: '600',
                                            marginBottom: '6px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                          }}>
                                            ⚠️ Loop Detected
                                          </div>
                                          <div style={{ color: '#fca5a5', fontSize: '12px', wordBreak: 'break-all' }}>
                                            {'loopDetectedAt' in result ? (result.loopDetectedAt || 'Unknown location') : 'Unknown location'}
                                          </div>
                                        </div>
                                      </>
                                    )}

                                    {key === 'final_url_status' && (
                                      <>
                                        <div style={{ 
                                          padding: '10px', 
                                          background: ('finalUrlStatus' in result && result.finalUrlStatus === 'ok') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                                          borderRadius: '6px',
                                          border: `1px solid ${('finalUrlStatus' in result && result.finalUrlStatus === 'ok') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                        }}>
                                          <div style={{ 
                                            fontSize: '11px', 
                                            color: ('finalUrlStatus' in result && result.finalUrlStatus === 'ok') ? '#10b981' : '#ef4444', 
                                            fontWeight: '600',
                                            marginBottom: '6px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                          }}>
                                            🎯 Final URL Status
                                          </div>
                                          <div style={{ color: '#ccc', fontSize: '12px', wordBreak: 'break-all', marginBottom: '6px' }}>
                                            {'finalUrl' in result ? result.finalUrl : 'N/A'}
                                          </div>
                                          <div style={{ fontSize: '11px', color: '#999' }}>
                                            Status Code: <strong style={{ color: ('finalUrlStatusCode' in result && result.finalUrlStatusCode === 200) ? '#10b981' : '#ef4444' }}>
                                              {'finalUrlStatusCode' in result ? result.finalUrlStatusCode : 'N/A'}
                                            </strong> ({'finalUrlStatus' in result ? result.finalUrlStatus : 'N/A'})
                                          </div>
                                        </div>
                                      </>
                                    )}

                                    {key === 'broken_redirects' && (
                                      <>
                                        <div style={{ 
                                          padding: '10px', 
                                          background: 'rgba(239, 68, 68, 0.1)', 
                                          borderRadius: '6px',
                                          border: '1px solid rgba(239, 68, 68, 0.3)'
                                        }}>
                                          <div style={{ 
                                            fontSize: '11px', 
                                            color: '#ef4444', 
                                            fontWeight: '600',
                                            marginBottom: '6px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                          }}>
                                            ❌ Broken Redirect
                                          </div>
                                          <div style={{ color: '#ccc', fontSize: '12px', wordBreak: 'break-all', marginBottom: '6px' }}>
                                            Final URL: {'finalUrl' in result ? result.finalUrl : 'N/A'}
                                          </div>
                                          <div style={{ fontSize: '11px', color: '#fca5a5' }}>
                                            Status: {'finalUrlStatusCode' in result ? result.finalUrlStatusCode : 'N/A'} - {'brokenReason' in result ? (result.brokenReason || 'Unknown error') : 'Unknown error'}
                                          </div>
                                        </div>
                                      </>
                                    )}

                                    {key === 'canonical_alignment' && (
                                      <>
                                        <div style={{ 
                                          padding: '10px', 
                                          background: 'rgba(245, 158, 11, 0.1)', 
                                          borderRadius: '6px',
                                          border: '1px solid rgba(245, 158, 11, 0.3)'
                                        }}>
                                          <div style={{ 
                                            fontSize: '11px', 
                                            color: '#f59e0b', 
                                            fontWeight: '600',
                                            marginBottom: '6px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                          }}>
                                            🔗 Canonical Alignment: {'canonicalAlignment' in result ? result.canonicalAlignment?.toUpperCase() : 'N/A'}
                                          </div>
                                          <div style={{ color: '#ccc', fontSize: '12px', wordBreak: 'break-all', marginBottom: '6px' }}>
                                            Final URL: {'finalUrl' in result ? result.finalUrl : 'N/A'}
                                          </div>
                                          <div style={{ color: '#ccc', fontSize: '12px', wordBreak: 'break-all', marginBottom: '6px' }}>
                                            Canonical: {'canonicalUrl' in result ? (result.canonicalUrl || 'Not found') : 'Not found'}
                                          </div>
                                          {'canonicalMismatchReason' in result && result.canonicalMismatchReason && (
                                            <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '6px' }}>
                                              {result.canonicalMismatchReason}
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {hasIssues && !isExpanded && matchingResults.length > 0 && (
                        <div style={{ 
                          marginTop: '12px', 
                          color: '#999', 
                          fontSize: '12px',
                          padding: '8px 12px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          borderRadius: '4px'
                        }}>
                          <div style={{ marginBottom: '4px', wordBreak: 'break-all' }}>
                            {matchingResults[0].originalUrl}
                          </div>
                          {matchingResults.length > 1 && (
                            <div style={{ color: '#666', fontStyle: 'italic' }}>
                              +{matchingResults.length - 1} more... (Click to expand)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!auditData && !checkError && !checking && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#999',
                fontSize: '14px'
              }}>
                Click "check audit" to analyze redirects
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditChecker;
