import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import '../../pages/DataViewer.css';

interface WordcountData {
  url: string;
  totalWordCount?: number;
  visibleWordCount?: number;
  uniqueWordCount?: number;
  textToHtmlRatio?: number;
  sentenceCount?: number;
  paragraphCount?: number;
  averageSentenceLength?: number;
  averageParagraphLength?: number;
  keywordDensity?: number;
  thinContent?: boolean;
  thinContentReason?: string | null;
  duplicateContent?: boolean;
  duplicateWithUrls?: string[];
  sectionWordCountMapping?: Record<string, number>;
  sectionWordCountBreakdown?: Record<string, number>;
  headingWordCountMapping?: Record<string, number>;
}

interface WordcountAnalysisProps {
  initialSessionId: number | null;
}

// Utility function to get status color based on value ranges
const getStatusColor = (value: number | undefined, type: 'ratio' | 'sentence' | 'paragraph' | 'density'): string => {
  if (value === null || value === undefined) return '#999';
  
  switch (type) {
    case 'ratio':
      if (value > 30) return '#10b981';
      if (value > 15) return '#f59e0b';
      return '#ef4444';
      
    case 'sentence':
      if (value >= 15 && value <= 20) return '#10b981';
      if (value > 25) return '#ef4444';
      return '#f59e0b';
      
    case 'paragraph':
      if (value >= 40 && value <= 80) return '#10b981';
      if (value > 120) return '#ef4444';
      return '#f59e0b';
      
    case 'density':
      if (value >= 0.5 && value <= 2) return '#10b981';
      if (value > 5) return '#ef4444';
      if (value > 3) return '#f59e0b';
      return '#999';
      
    default:
      return '#fff';
  }
};

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, isExpanded, onToggle, children }) => {
  return (
    <div style={{ 
      background: 'rgba(0, 0, 0, 0.3)', 
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      overflow: 'hidden'
    }}>
      <div 
        onClick={onToggle}
        style={{
          padding: '20px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.2)',
          transition: 'background 0.2s',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)';
        }}
      >
        <h4 style={{ 
          color: '#667eea', 
          margin: 0, 
          fontSize: '14px', 
          fontWeight: '600',
          flex: 1
        }}>
          {title}
        </h4>
        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: '#667eea',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.3s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          ▼
        </button>
      </div>
      <div
        style={{
          maxHeight: isExpanded ? '10000px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out',
          padding: isExpanded ? '20px' : '0 20px'
        }}
      >
        {isExpanded && children}
      </div>
    </div>
  );
};

const WordcountAnalysis: React.FC<WordcountAnalysisProps> = ({ initialSessionId }) => {
  const { accessToken, authFetch } = useAuth();
  const [data, setData] = useState<WordcountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  
  // Pagination for left panel
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Section expand/collapse state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basicWordCount: false,
    sentenceParagraph: false,
    keywordQuality: false,
    duplicateUrls: false,
    sectionMapping: false,
    sectionBreakdown: false,
    headingMapping: false
  });

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
        throw new Error(`Failed to load wordcount data: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      const pages = result.pages || [];
      
      const transformedData: WordcountData[] = pages.map((page: any) => {
        const totalWordCount = page.totalWordCount ?? page.total_word_count ?? page.visibleWordCount ?? page.visible_word_count ?? null;
        
        const parseJsonField = (field: any): Record<string, number> | null => {
          if (!field) return null;
          if (typeof field === 'object') return field;
          if (typeof field === 'string') {
            try {
              return JSON.parse(field);
            } catch {
              return null;
            }
          }
          return null;
        };

        const parseArrayField = (field: any): string[] | null => {
          if (!field) return null;
          if (Array.isArray(field)) return field;
          if (typeof field === 'string') {
            try {
              const parsed = JSON.parse(field);
              return Array.isArray(parsed) ? parsed : null;
            } catch {
              return null;
            }
          }
          return null;
        };
        
        return {
          url: page.url || '',
          totalWordCount: totalWordCount,
          visibleWordCount: page.visibleWordCount ?? page.visible_word_count ?? null,
          uniqueWordCount: page.uniqueWordCount ?? page.unique_word_count ?? null,
          textToHtmlRatio: page.textToHtmlRatio ?? page.text_to_html_ratio ?? null,
          sentenceCount: page.sentenceCount ?? page.sentence_count ?? null,
          paragraphCount: page.paragraphCount ?? page.paragraph_count ?? null,
          averageSentenceLength: page.averageSentenceLength ?? page.average_sentence_length ?? null,
          averageParagraphLength: page.averageParagraphLength ?? page.average_paragraph_length ?? null,
          keywordDensity: page.keywordDensity ?? page.keyword_density ?? null,
          thinContent: page.thinContent ?? page.thin_content ?? null,
          thinContentReason: page.thinContentReason ?? page.thin_content_reason ?? null,
          duplicateContent: page.duplicateContent ?? page.duplicate_content ?? null,
          duplicateWithUrls: parseArrayField(page.duplicateWithUrls ?? page.duplicate_with_urls),
          sectionWordCountMapping: parseJsonField(page.sectionWordCountMapping ?? page.section_word_count_mapping),
          sectionWordCountBreakdown: parseJsonField(page.sectionWordCountBreakdown ?? page.section_word_count_breakdown),
          headingWordCountMapping: parseJsonField(page.headingWordCountMapping ?? page.heading_word_count_mapping),
        };
      });
      
      setData(transformedData);
      
      if (transformedData.length > 0 && !selectedUrl) {
        setSelectedUrl(transformedData[0].url);
      }
    } catch (err) {
      console.error('Error loading wordcount data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
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

  // Toggle section expand/collapse
  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const filteredData = data.filter(item =>
    (item.url || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination calculations
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageData = filteredData.slice(startIndex, endIndex);

  const selectedData = data.find(item => item.url === selectedUrl) || null;

  const exportData = async (format: 'json' | 'csv' | 'txt' | 'xml') => {
    try {
      const params = new URLSearchParams();
      params.set('sessionId', String(initialSessionId));
      params.set('format', format);
      params.set('type', 'wordcount');
      
      const response = await authFetch(`/api/export?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to export data');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wordcount_analysis_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export data');
    }
  };

  const calculateStats = () => {
    if (!filteredData.length) return null;
    
    const visibleWordCounts = filteredData
      .filter(item => item.visibleWordCount !== null && item.visibleWordCount !== undefined)
      .map(item => item.visibleWordCount!);
    const textRatios = filteredData
      .filter(item => item.textToHtmlRatio !== null && item.textToHtmlRatio !== undefined)
      .map(item => item.textToHtmlRatio!);
    
    return {
      totalPages: filteredData.length,
      avgVisibleWords: visibleWordCounts.length ? Math.round(visibleWordCounts.reduce((a, b) => a + b, 0) / visibleWordCounts.length) : 0,
      maxVisibleWords: visibleWordCounts.length ? Math.max(...visibleWordCounts) : 0,
      minVisibleWords: visibleWordCounts.length ? Math.min(...visibleWordCounts) : 0,
      avgTextRatio: textRatios.length ? Math.round((textRatios.reduce((a, b) => a + b, 0) / textRatios.length) * 100) / 100 : 0,
    };
  };

  const stats = calculateStats();

  if (loading && data.length === 0) {
    return (
      <div className="data-viewer" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="loading">Loading wordcount analysis...</div>
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
          <span>📝</span> Wordcount Analysis
        </h2>
      </div>

      {/* Search and Export */}
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
          gap: '12px',
          flexShrink: 0
        }}>
          <div style={{ background: 'rgba(102, 126, 234, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(102, 126, 234, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Total Pages</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{stats?.totalPages}</div>
          </div>
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Avg Visible Words</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{stats?.avgVisibleWords}</div>
          </div>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Max Visible Words</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{stats?.maxVisibleWords}</div>
          </div>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Min Visible Words</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{stats?.minVisibleWords}</div>
          </div>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>Avg Text Ratio</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{stats?.avgTextRatio}%</div>
          </div>
        </div>
      )}

      {/* Two Panel Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'rgba(0, 0, 0, 0.3)', minHeight: 0 }}>
        {/* Left Panel - URL List */}
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
                  {item.visibleWordCount !== null && item.visibleWordCount !== undefined && (
                    <div style={{ 
                      color: '#999', 
                      fontSize: '10px', 
                      marginTop: '4px' 
                    }}>
                      {item.visibleWordCount.toLocaleString()} words
                    </div>
                  )}
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

        {/* Right Panel - Data Display */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'rgba(0, 0, 0, 0.1)',
          height: '100%'
        }}>
          {!selectedData ? (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: '#999',
              fontSize: '14px'
            }}>
              Select a URL from the left to view details
            </div>
          ) : (
            <>
              {/* URL Header */}
              <div style={{ 
                padding: '20px 30px', 
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)', 
                background: 'rgba(0, 0, 0, 0.3)',
                flexShrink: 0
              }}>
                <h3 style={{ color: '#fff', margin: 0, marginBottom: '10px', fontSize: '16px', fontWeight: '600' }}>
                  {selectedData.url}
                </h3>
                <a 
                  href={selectedData.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    color: '#667eea', 
                    fontSize: '12px',
                    textDecoration: 'none'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                >
                  Open in new tab →
                </a>
              </div>

              {/* Scrollable Content Area */}
              <div 
                style={{ 
                  flex: 1, 
                  overflowY: 'auto', 
                  padding: '30px',
                  minHeight: 0
                }}
              >
                {selectedData && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Section 1: Basic Metrics */}
                    <CollapsibleSection
                      title="📝 Basic Word Count Metrics"
                      isExpanded={expandedSections.basicWordCount}
                      onToggle={() => toggleSection('basicWordCount')}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                        <DataRow label="Total Word Count" value={selectedData.totalWordCount?.toLocaleString()} />
                        <DataRow label="Visible Word Count" value={selectedData.visibleWordCount?.toLocaleString()} />
                        <DataRow label="Unique Word Count" value={selectedData.uniqueWordCount?.toLocaleString()} />
                        <DataRow 
                          label="Text to HTML Ratio" 
                          value={selectedData.textToHtmlRatio !== null && selectedData.textToHtmlRatio !== undefined 
                            ? `${selectedData.textToHtmlRatio.toFixed(2)}%` 
                            : null}
                          color={getStatusColor(selectedData.textToHtmlRatio, 'ratio')}
                        />
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                      title="📄 Sentence & Paragraph Metrics"
                      isExpanded={expandedSections.sentenceParagraph}
                      onToggle={() => toggleSection('sentenceParagraph')}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                        <DataRow label="Sentence Count" value={selectedData.sentenceCount?.toLocaleString()} />
                        <DataRow label="Paragraph Count" value={selectedData.paragraphCount?.toLocaleString()} />
                        <DataRow 
                          label="Average Sentence Length" 
                          value={selectedData.averageSentenceLength !== null && selectedData.averageSentenceLength !== undefined 
                            ? selectedData.averageSentenceLength.toFixed(1) 
                            : null}
                          color={getStatusColor(selectedData.averageSentenceLength, 'sentence')}
                        />
                        <DataRow 
                          label="Average Paragraph Length" 
                          value={selectedData.averageParagraphLength !== null && selectedData.averageParagraphLength !== undefined 
                            ? selectedData.averageParagraphLength.toFixed(1) 
                            : null}
                          color={getStatusColor(selectedData.averageParagraphLength, 'paragraph')}
                        />
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                      title="🎯 Keyword & Content Quality"
                      isExpanded={expandedSections.keywordQuality}
                      onToggle={() => toggleSection('keywordQuality')}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                        <DataRow 
                          label="Keyword Density" 
                          value={selectedData.keywordDensity !== null && selectedData.keywordDensity !== undefined 
                            ? `${selectedData.keywordDensity.toFixed(2)}%` 
                            : null}
                          color={getStatusColor(selectedData.keywordDensity, 'density')}
                        />
                        <DataRow 
                          label="Thin Content" 
                          value={selectedData.thinContent !== null && selectedData.thinContent !== undefined 
                            ? (selectedData.thinContent ? '⚠️ Yes' : '✓ No') 
                            : null}
                          color={selectedData.thinContent ? '#ef4444' : '#10b981'}
                        />
                        {selectedData.thinContentReason && (
                          <DataRow label="Thin Content Reason" value={selectedData.thinContentReason} />
                        )}
                        <DataRow 
                          label="Duplicate Content" 
                          value={selectedData.duplicateContent !== null && selectedData.duplicateContent !== undefined 
                            ? (selectedData.duplicateContent ? '🔄 Yes' : '✓ No') 
                            : null}
                          color={selectedData.duplicateContent ? '#f59e0b' : '#10b981'}
                        />
                      </div>
                    </CollapsibleSection>

                    {/* Section 2: Content Quality (Duplicate URLs) */}
                    {selectedData.duplicateContent && selectedData.duplicateWithUrls && selectedData.duplicateWithUrls.length > 0 && (
                      <CollapsibleSection
                        title="🔄 Duplicate With URLs"
                        isExpanded={expandedSections.duplicateUrls}
                        onToggle={() => toggleSection('duplicateUrls')}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                          {selectedData.duplicateWithUrls.map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#667eea',
                                fontSize: '12px',
                                textDecoration: 'none',
                                padding: '8px 12px',
                                background: 'rgba(102, 126, 234, 0.1)',
                                borderRadius: '4px',
                                wordBreak: 'break-all',
                                border: '1px solid rgba(102, 126, 234, 0.2)'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
                                e.currentTarget.style.textDecoration = 'underline';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';
                                e.currentTarget.style.textDecoration = 'none';
                              }}
                            >
                              {url}
                            </a>
                          ))}
                        </div>
                      </CollapsibleSection>
                    )}

                    {/* Section 3: Section Word Count Mapping */}
                    {selectedData.sectionWordCountMapping && Object.keys(selectedData.sectionWordCountMapping).length > 0 && (
                      <CollapsibleSection
                        title="📊 Section Word Count Mapping"
                        isExpanded={expandedSections.sectionMapping}
                        onToggle={() => toggleSection('sectionMapping')}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
                          {Object.entries(selectedData.sectionWordCountMapping).map(([section, count]) => (
                            <div key={section} style={{
                              padding: '12px',
                              background: 'rgba(102, 126, 234, 0.1)',
                              borderRadius: '6px',
                              border: '1px solid rgba(102, 126, 234, 0.2)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <span style={{ color: '#fff', fontWeight: '500', flex: 1, wordBreak: 'break-word' }}>{section}</span>
                              <span style={{ color: '#667eea', fontWeight: '600', marginLeft: '15px', whiteSpace: 'nowrap' }}>
                                {count.toLocaleString()} words
                              </span>
                              {selectedData.sectionWordCountBreakdown && selectedData.sectionWordCountBreakdown[section] !== undefined && (
                                <span style={{ color: '#999', fontSize: '12px', marginLeft: '15px', whiteSpace: 'nowrap' }}>
                                  ({selectedData.sectionWordCountBreakdown[section].toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </CollapsibleSection>
                    )}

                    {/* Section Word Count Breakdown */}
                    {selectedData.sectionWordCountBreakdown && Object.keys(selectedData.sectionWordCountBreakdown).length > 0 && (
                      <CollapsibleSection
                        title="📈 Section Word Count Breakdown (%)"
                        isExpanded={expandedSections.sectionBreakdown}
                        onToggle={() => toggleSection('sectionBreakdown')}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
                          {Object.entries(selectedData.sectionWordCountBreakdown)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([section, percentage]) => (
                              <div key={section} style={{
                                padding: '12px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                borderRadius: '6px',
                                border: '1px solid rgba(16, 185, 129, 0.2)'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <span style={{ color: '#fff', fontWeight: '500', flex: 1, wordBreak: 'break-word' }}>{section}</span>
                                  <span style={{ color: '#10b981', fontWeight: '600', marginLeft: '15px', whiteSpace: 'nowrap' }}>
                                    {percentage.toFixed(1)}%
                                  </span>
                                </div>
                                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ 
                                    height: '100%', 
                                    width: `${Math.min(percentage, 100)}%`, 
                                    background: '#10b981', 
                                    borderRadius: '3px',
                                    transition: 'width 0.3s'
                                  }}></div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </CollapsibleSection>
                    )}

                    {/* Section 4: Heading Word Count Mapping */}
                    {selectedData.headingWordCountMapping && Object.keys(selectedData.headingWordCountMapping).length > 0 && (
                      <CollapsibleSection
                        title="📑 Heading Word Count Mapping"
                        isExpanded={expandedSections.headingMapping}
                        onToggle={() => toggleSection('headingMapping')}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
                          {Object.entries(selectedData.headingWordCountMapping).map(([heading, count]) => (
                            <div key={heading} style={{
                              padding: '12px',
                              background: 'rgba(16, 185, 129, 0.1)',
                              borderRadius: '6px',
                              border: '1px solid rgba(16, 185, 129, 0.2)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <span style={{ color: '#fff', fontWeight: '500', flex: 1, wordBreak: 'break-word', fontSize: '12px' }}>{heading}</span>
                              <span style={{ color: '#10b981', fontWeight: '600', marginLeft: '15px', whiteSpace: 'nowrap' }}>
                                {count.toLocaleString()} words
                              </span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleSection>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper component for data rows
const DataRow: React.FC<{ label: string; value: string | number | null | undefined; color?: string }> = ({ label, value, color }) => {
  return (
    <div style={{ 
      padding: '12px', 
      background: 'rgba(255, 255, 255, 0.05)', 
      borderRadius: '6px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ 
        color: color || '#fff', 
        fontSize: '16px', 
        fontWeight: '600' 
      }}>
        {value !== null && value !== undefined ? value : '—'}
      </div>
    </div>
  );
};

export default WordcountAnalysis;
