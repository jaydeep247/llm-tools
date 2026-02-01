import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import '../../pages/DataViewer.css';

interface PageData {
  url: string;
}

interface CheckResults {
  brokenInternalLinks: { count: number; links: Array<{ url: string; sourceUrl?: string; statusCode: number; errorType?: string; error?: string }> };
  brokenExternalLinks: { count: number; links: Array<{ url: string; sourceUrl?: string; statusCode: number; errorType?: string; error?: string }> };
  missingPages: { count: number; links: Array<{ url: string; sourceUrl?: string; statusCode: number; missingType?: string }> };
  serverErrors: { count: number; links: Array<{ url: string; sourceUrl?: string; statusCode: number }> };
  timeoutUnreachable: { count: number; links: Array<{ url: string; sourceUrl?: string; statusCode: number; errorType?: string; error?: string }> };
  totalChecked?: number;
  totalPageLinks?: number;
}

interface BrokenLinkCheckerProps {
  initialSessionId: number | null;
}

const BrokenLinkChecker: React.FC<BrokenLinkCheckerProps> = ({ initialSessionId }) => {
  const { accessToken, authFetch } = useAuth();
  const [data, setData] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  
  // Link checking state
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<CheckResults | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  
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

  const handleCheckLinks = async () => {
    if (!initialSessionId) {
      setCheckError('No session selected');
      return;
    }

    setChecking(true);
    setCheckError(null);
    setCheckResults(null);

    try {
      const response = await authFetch(`/api/links/check/${initialSessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to check links: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      setCheckResults(result.results);
    } catch (err: any) {
      console.error('Error checking links:', err);
      setCheckError(err.message || 'Failed to check links');
    } finally {
      setChecking(false);
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
          <span>🔗</span> Broken Link Checker
        </h2>
      </div>

      {/* Search */}
      <div style={{ padding: '20px 30px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search by URL or anchor text..."
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
        {/* Left Panel - Links List */}
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
              currentPageData.map((item, index) => (
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
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    wordBreak: 'break-all'
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
                  <div style={{ 
                    color: selectedUrl === item.url ? '#fff' : '#ccc', 
                    fontSize: '12px',
                    fontWeight: selectedUrl === item.url ? '500' : '400',
                    lineHeight: '1.5'
                  }}>
                    {item.url}
                  </div>
                </div>
              ))
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

        {/* Right Panel - Link Checking */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'rgba(0, 0, 0, 0.1)',
          height: '100%'
        }}>
          {/* Check Link Button */}
          <div style={{ 
            padding: '20px 30px', 
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)', 
            background: 'rgba(0, 0, 0, 0.3)',
            flexShrink: 0
          }}>
            <button
              onClick={handleCheckLinks}
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
              {checking ? 'Checking Links...' : 'Check Link'}
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

            {checkResults && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Section summary: "We have found X broken links" or "No broken links found" */}
                {(() => {
                  const totalBroken =
                    checkResults.brokenInternalLinks.count +
                    checkResults.brokenExternalLinks.count +
                    checkResults.missingPages.count +
                    checkResults.serverErrors.count +
                    checkResults.timeoutUnreachable.count;
                  return (
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: '8px',
                        border: totalBroken > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                        background: totalBroken > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                        marginBottom: '8px',
                        fontSize: '15px',
                        fontWeight: '600',
                        color: totalBroken > 0 ? '#fca5a5' : '#6ee7b7'
                      }}
                    >
                      {totalBroken > 0
                        ? `We have found ${totalBroken} broken link${totalBroken === 1 ? '' : 's'}.`
                        : 'No broken links found.'}
                    </div>
                  );
                })()}

                {/* Summary Statistics */}
                {(checkResults.totalChecked !== undefined || checkResults.totalPageLinks !== undefined) && (
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
                      {checkResults.totalChecked !== undefined && (
                        <div>
                          <span style={{ color: '#999', fontSize: '12px' }}>Checked: </span>
                          <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
                            {checkResults.totalChecked}
                          </span>
                        </div>
                      )}
                      {checkResults.totalPageLinks !== undefined && (
                        <div>
                          <span style={{ color: '#999', fontSize: '12px' }}>Total Page Links: </span>
                          <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
                            {checkResults.totalPageLinks}
                          </span>
                        </div>
                      )}
                      <div>
                        <span style={{ color: '#999', fontSize: '12px' }}>Total Issues: </span>
                        <span style={{ color: '#ef4444', fontSize: '14px', fontWeight: '600' }}>
                          {checkResults.brokenInternalLinks.count + 
                           checkResults.brokenExternalLinks.count + 
                           checkResults.missingPages.count + 
                           checkResults.serverErrors.count + 
                           checkResults.timeoutUnreachable.count}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Result Row Component */}
                {([
                  { key: 'brokenInternal', title: 'Identify broken internal links', data: checkResults.brokenInternalLinks, icon: '🔗', color: '#ef4444' },
                  { key: 'brokenExternal', title: 'Identify broken external links', data: checkResults.brokenExternalLinks, icon: '🌐', color: '#f59e0b' },
                  { key: 'missingPages', title: 'Detect missing pages (404, 410)', data: checkResults.missingPages, icon: '❌', color: '#ef4444' },
                  { key: 'serverErrors', title: 'Detect server errors (5xx)', data: checkResults.serverErrors, icon: '⚠️', color: '#dc2626' },
                  { key: 'timeoutUnreachable', title: 'Detect timeout or unreachable links', data: checkResults.timeoutUnreachable, icon: '⏱️', color: '#991b1b' }
                ] as const).map(({ key, title, data, icon, color }) => {
                  const isExpanded = expandedSections[key] || false;
                  const hasIssues = data.count > 0;
                  
                  return (
                    <div
                      key={key}
                      style={{
                        padding: '18px',
                        background: hasIssues ? `rgba(${color === '#ef4444' ? '239, 68, 68' : color === '#f59e0b' ? '245, 158, 11' : color === '#dc2626' ? '220, 38, 38' : '153, 27, 27'}, 0.1)` : 'rgba(0, 0, 0, 0.3)',
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
                        onClick={() => hasIssues && setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))}
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
                            {hasIssues ? `${data.count} found` : '✓ Done'}
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
                            {data.links.map((link, idx) => (
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
                                  {/* Broken Link - Main focus */}
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
                                      🔗 Broken Link:
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px' }}>
                                      <div style={{ flex: 1 }}>
                                        <a
                                          href={link.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{
                                            color: '#ef4444',
                                            fontSize: '13px',
                                            fontWeight: '500',
                                            textDecoration: 'none',
                                            wordBreak: 'break-all',
                                            display: 'block'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.textDecoration = 'underline';
                                            e.currentTarget.style.color = '#dc2626';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.textDecoration = 'none';
                                            e.currentTarget.style.color = '#ef4444';
                                          }}
                                        >
                                          {link.url}
                                        </a>
                                        {(link as any).missingType && (
                                          <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '6px', fontWeight: '500' }}>
                                            Type: {(link as any).missingType === '404' ? 'Not Found (404)' : 'Gone (410 - Permanently Removed)'}
                                          </div>
                                        )}
                                        {'error' in link && link.error && (
                                          <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '6px', fontWeight: '500' }}>
                                            Error: {link.error}
                                          </div>
                                        )}
                                      </div>
                                      <span style={{
                                        color: color,
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        padding: '6px 12px',
                                        background: `${color}20`,
                                        borderRadius: '4px',
                                        whiteSpace: 'nowrap',
                                        height: 'fit-content',
                                        border: `1px solid ${color}40`
                                      }}>
                                        {link.statusCode || ('errorType' in link && link.errorType) || 'Error'}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Source Page - Where the broken link was found */}
                                  {link.sourceUrl && (
                                    <div style={{ 
                                      padding: '8px 10px', 
                                      background: 'rgba(102, 126, 234, 0.1)', 
                                      borderRadius: '6px',
                                      border: '1px solid rgba(102, 126, 234, 0.2)'
                                    }}>
                                      <div style={{ 
                                        fontSize: '10px', 
                                        color: '#667eea', 
                                        fontWeight: '600',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                      }}>
                                        📄 Found on Page:
                                      </div>
                                      <a
                                        href={link.sourceUrl}
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
                                        {link.sourceUrl}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {hasIssues && !isExpanded && data.links.length > 0 && (
                        <div style={{ 
                          marginTop: '12px', 
                          color: '#999', 
                          fontSize: '12px',
                          padding: '8px 12px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          borderRadius: '4px'
                        }}>
                          <div style={{ marginBottom: '4px', wordBreak: 'break-all' }}>
                            {data.links[0].url}
                          </div>
                          {data.count > 1 && (
                            <div style={{ color: '#666', fontStyle: 'italic' }}>
                              +{data.count - 1} more... (Click to expand)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!checkResults && !checkError && !checking && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#999',
                fontSize: '14px'
              }}>
                Click "Check Link" to analyze all links
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrokenLinkChecker;
