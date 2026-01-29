import React, { useEffect, useState } from 'react';
import { useLazyGetDataListQuery } from '../../store/api/module_A/dataApi';
import '../../pages/DataViewer.css';

interface CrawlData {
  url: string;
  title: string;
  timestamp: string;
  success?: boolean;
  // Core text metrics from Module A (wordcount_analysis)
  totalWordCount?: number;
  visibleWordCount?: number;
  sentenceCount?: number;
  paragraphCount?: number;
  averageSentenceLength?: number;
  averageParagraphLength?: number;
  keywordDensity?: number;
  textToHtmlRatio?: number;
  thinContent?: boolean;
  thinContentReason?: string | null;
  contentType?: string;
  resourceType?: string;
}

interface TextQualityAnalyzerProps {
  initialSessionId: number | null;
}

const TextQualityAnalyzer: React.FC<TextQualityAnalyzerProps> = ({ initialSessionId }) => {
  const [data, setData] = useState<CrawlData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof CrawlData>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [serverLimit] = useState(1000);

  const [getDataList, { isLoading: loading }] = useLazyGetDataListQuery();

  useEffect(() => {
    if (initialSessionId) {
      setServerOffset(0);
      loadData();
    } else {
      setData([]);
      setServerTotal(null);
    }
  }, [initialSessionId]);

  const isPageUrl = (url: string, resourceType?: string, contentType?: string) => {
    const lowerUrl = (url || '').toLowerCase();

    // Filter out obvious non-HTML resources by extension
    const nonPageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.svg',
      '.ico',
      '.bmp',
      '.pdf',
      '.js',
      '.css',
      '.json',
      '.txt',
      '.xml',
      '.woff',
      '.woff2',
      '.ttf',
      '.otf',
      '.mp4',
      '.webm',
      '.avi',
      '.mov',
      '.zip',
      '.rar',
      '.7z',
      '.tar',
      '.gz',
    ];

    const cleanPath = lowerUrl.split(/[?#]/)[0];
    const dotIndex = cleanPath.lastIndexOf('.');
    if (dotIndex !== -1) {
      const ext = cleanPath.substring(dotIndex);
      if (nonPageExtensions.includes(ext)) {
        return false;
      }
    }

    // If content type is known and not HTML, drop it
    if (contentType && !contentType.toLowerCase().startsWith('text/html')) {
      return false;
    }

    // If resourceType is explicitly something else than a page, drop it
    if (resourceType && resourceType.toLowerCase() !== 'page' && resourceType.toLowerCase() !== 'html') {
      return false;
    }

    return true;
  };

  const loadData = async (opts?: { append?: boolean }) => {
    if (!initialSessionId) return;

    try {
      setError(null);

      const result = await getDataList({
        limit: serverLimit,
        offset: opts?.append ? serverOffset : 0,
        sessionId: initialSessionId || undefined,
      }).unwrap();

      const rawItems: CrawlData[] = (result.data || []).map((item: any) => ({
        url: item.url || '',
        title: item.title || 'No title',
        timestamp: item.timestamp || new Date().toISOString(),
        success: item.success,
        // Text metrics (already computed on backend in Module A)
        totalWordCount:
          item.totalWordCount ??
          item.total_word_count ??
          item.wordCount ??
          null,
        visibleWordCount:
          item.visibleWordCount ??
          item.visible_word_count ??
          null,
        sentenceCount:
          item.sentenceCount ??
          item.sentence_count ??
          null,
        paragraphCount:
          item.paragraphCount ??
          item.paragraph_count ??
          null,
        averageSentenceLength:
          item.averageSentenceLength ??
          item.average_sentence_length ??
          null,
        averageParagraphLength:
          item.averageParagraphLength ??
          item.average_paragraph_length ??
          null,
        keywordDensity:
          item.keywordDensity ??
          item.keyword_density ??
          null,
        textToHtmlRatio:
          item.textToHtmlRatio ??
          item.text_to_html_ratio ??
          null,
        thinContent:
          item.thinContent ??
          item.thin_content ??
          null,
        thinContentReason:
          item.thinContentReason ??
          item.thin_content_reason ??
          null,
        contentType: item.contentType,
        resourceType: item.resourceType,
      }));

      // Keep only real page URLs (no files/images)
      const items = rawItems.filter((item) =>
        isPageUrl(item.url, item.resourceType, item.contentType)
      );

      setServerTotal(
        result?.paging?.total ??
          result?.pagination?.total ??
          items.length ??
          null
      );

      if (opts?.append) {
        setData((prev) => [...prev, ...items]);
      } else {
        setData(items);
      }

      setServerOffset((opts?.append ? serverOffset : 0) + items.length);
    } catch (err: any) {
      const errorMsg =
        err?.data?.message || err?.message || 'Failed to load data';
      setError(errorMsg);
      setData([]);
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
    .filter(
      (item) =>
        (item.url || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.title || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return 0;
    });

  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = filteredAndSortedData.slice(startIndex, endIndex);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // ===== Text Quality Helpers (purely interpretive, using backend metrics) =====

  const classifySentenceComplexity = (avgLen?: number | null) => {
    if (avgLen === null || avgLen === undefined) {
      return { label: 'Unknown', level: 'neutral' as const };
    }
    if (avgLen >= 15 && avgLen <= 20) return { label: 'Good', level: 'good' as const };
    if (avgLen >= 21 && avgLen <= 25) return { label: 'Complex', level: 'warning' as const };
    if (avgLen > 25) return { label: 'Hard to read', level: 'bad' as const };
    // Very short sentences can feel choppy
    return { label: 'Very short', level: 'warning' as const };
  };

  const classifyParagraphStructure = (
    avgLen?: number | null,
    paragraphCount?: number | null
  ) => {
    if (avgLen === null || avgLen === undefined || paragraphCount === null || paragraphCount === undefined) {
      return { label: 'Unknown', level: 'neutral' as const };
    }

    // Baseline by average words per paragraph
    if (avgLen >= 40 && avgLen <= 80) {
      // Good baseline, but very few paragraphs is still a UX issue
      if (paragraphCount <= 1) {
        return { label: 'Few paragraphs', level: 'warning' as const };
      }
      return { label: 'Good', level: 'good' as const };
    }
    if (avgLen > 120) return { label: 'Wall of text', level: 'bad' as const };
    if (avgLen > 80 && avgLen <= 120) return { label: 'Heavy', level: 'warning' as const };

    // Short paragraphs are OK but may feel choppy if there are many tiny ones
    if (avgLen < 40) return { label: 'Very short', level: 'warning' as const };

    return { label: 'Unknown', level: 'neutral' as const };
  };

  const classifyKeywordDensity = (density?: number | null) => {
    if (density === null || density === undefined) {
      return { label: 'Unknown', level: 'neutral' as const };
    }
    if (density >= 0.5 && density <= 2) return { label: 'Healthy', level: 'good' as const };
    if (density > 2 && density <= 3) return { label: 'High', level: 'warning' as const };
    if (density > 3) return { label: 'Stuffing risk', level: 'bad' as const };
    // Below 0.5% is under-optimised
    return { label: 'Low', level: 'warning' as const };
  };

  const classifyTextRatio = (ratio?: number | null) => {
    if (ratio === null || ratio === undefined) {
      return { label: 'Unknown', level: 'neutral' as const };
    }
    if (ratio > 20) return { label: 'Healthy', level: 'good' as const };
    if (ratio >= 10 && ratio <= 20) return { label: 'Low content', level: 'warning' as const };
    return { label: 'Thin / template-heavy', level: 'bad' as const };
  };

  const computeClarityScore = (item: CrawlData) => {
    const avgSent = item.averageSentenceLength ?? null;
    const avgPara = item.averageParagraphLength ?? null;
    const ratio = item.textToHtmlRatio ?? null;

    let score = 100;

    // Sentence readability
    if (avgSent !== null) {
      if (avgSent >= 15 && avgSent <= 20) score += 0;
      else if (avgSent >= 21 && avgSent <= 25) score -= 10;
      else if (avgSent > 25) score -= 25;
      else if (avgSent < 10) score -= 5;
    }

    // Paragraph structure
    if (avgPara !== null) {
      if (avgPara >= 40 && avgPara <= 80) score += 0;
      else if (avgPara >= 80 && avgPara <= 120) score -= 10;
      else if (avgPara > 120) score -= 20;
      else if (avgPara < 30) score -= 5;
    }

    // Text ratio
    if (ratio !== null) {
      if (ratio > 20) score += 0;
      else if (ratio >= 10 && ratio <= 20) score -= 10;
      else score -= 20;
    }

    // Thin content penalty
    if (item.thinContent) {
      score -= 15;
    }

    // Clamp to 0–100
    score = Math.max(0, Math.min(100, score));

    let label: string;
    let level: 'good' | 'warning' | 'bad' | 'neutral';
    if (score >= 75) {
      label = 'Clear';
      level = 'good';
    } else if (score >= 55) {
      label = 'Could be clearer';
      level = 'warning';
    } else {
      label = 'Hard to follow';
      level = 'bad';
    }

    return { label, level, score };
  };

  const classifyToneConsistency = (item: CrawlData) => {
    // Simple heuristic: pages that are neither thin nor extremely short/long tend to be more consistent
    const avgSent = item.averageSentenceLength ?? null;
    const paragraphs = item.paragraphCount ?? null;

    if (avgSent === null || paragraphs === null) {
      return { label: 'Unknown', level: 'neutral' as const };
    }

    if (!item.thinContent && paragraphs >= 3 && avgSent >= 12 && avgSent <= 24) {
      return { label: 'Consistent', level: 'good' as const };
    }

    if (paragraphs <= 1 || avgSent > 28 || avgSent < 8) {
      return { label: 'Inconsistent', level: 'bad' as const };
    }

    return { label: 'Mixed', level: 'warning' as const };
  };

  const classifyMissingInfo = (item: CrawlData) => {
    const words = item.visibleWordCount ?? item.totalWordCount ?? 0;
    const paragraphs = item.paragraphCount ?? 0;

    if (!words) {
      return { label: 'No content', level: 'bad' as const };
    }

    if (item.thinContent || words < 300 || paragraphs <= 1) {
      return { label: 'Needs improvement', level: 'bad' as const };
    }
    if (words >= 300 && words <= 700) {
      return { label: 'OK', level: 'warning' as const };
    }
    return { label: 'Strong coverage', level: 'good' as const };
  };

  const renderQualityBadge = (
    text: string,
    level: 'good' | 'warning' | 'bad' | 'neutral'
  ) => {
    let background = 'rgba(107,114,128,0.18)';
    let border = '1px solid rgba(107,114,128,0.6)';
    let color = '#d1d5db';

    if (level === 'good') {
      background = 'rgba(16,185,129,0.12)';
      border = '1px solid rgba(16,185,129,0.6)';
      color = '#6ee7b7';
    } else if (level === 'warning') {
      background = 'rgba(245,158,11,0.12)';
      border = '1px solid rgba(245,158,11,0.6)';
      color = '#facc15';
    } else if (level === 'bad') {
      background = 'rgba(239,68,68,0.12)';
      border = '1px solid rgba(239,68,68,0.6)';
      color = '#fca5a5';
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 10px',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 500,
          background,
          border,
          color,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    );
  };

  return (
    <div className="data-viewer" style={{ height: '100%' }}>
      <div className="data-viewer-header">
        <h2>✨ Text Quality Analyzer</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {initialSessionId ? (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.6)',
                color: '#6ee7b7',
                whiteSpace: 'nowrap',
              }}
            >
              Session #{initialSessionId}
            </span>
          ) : (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: '999px',
                background: 'rgba(107, 114, 128, 0.18)',
                border: '1px solid rgba(107, 114, 128, 0.7)',
                color: '#d1d5db',
                whiteSpace: 'nowrap',
              }}
            >
              No active session
            </span>
          )}
        </div>
      </div>

      <div className="data-viewer-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search URLs or titles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="data-stats">
        <span>Total (loaded): {data.length} items</span>
        {serverTotal !== null && <span>Server total: {serverTotal}</span>}
        <span>Filtered: {filteredAndSortedData.length} items</span>
        <span>Page {totalPages ? currentPage : 0} of {totalPages}</span>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: '#7f2d2d',
            border: '1px solid #c24646',
            borderRadius: '8px',
            padding: '12px 16px',
            margin: '0 16px 16px',
            color: '#ffcccc',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th
                onClick={() => handleSort('url')}
                className="sortable"
              >
                URL {sortField === 'url' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('title')}
                className="sortable"
              >
                Title{' '}
                {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>Sentence Length / Complexity</th>
              <th>Paragraph Structure</th>
              <th>Keyword / Entity Usage</th>
              <th>Clarity &amp; Coherence</th>
              <th>Tone &amp; Style</th>
              <th>Text Ratio</th>
              <th>Missing / Weak Info</th>
            </tr>
          </thead>
          <tbody>
            {!initialSessionId ? (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', padding: '24px' }}>
                  Start a crawl and select a session to view text quality data.
                </td>
              </tr>
            ) : loading && !data.length ? (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', padding: '24px' }}>
                  Loading data...
                </td>
              </tr>
            ) : currentData.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', padding: '24px' }}>
                  No pages found for this session.
                </td>
              </tr>
            ) : (
              currentData.map((item, index) => {
                const sentenceInfo = classifySentenceComplexity(
                  item.averageSentenceLength
                );
                const paragraphInfo = classifyParagraphStructure(
                  item.averageParagraphLength,
                  item.paragraphCount
                );
                const keywordInfo = classifyKeywordDensity(
                  item.keywordDensity
                );
                const ratioInfo = classifyTextRatio(item.textToHtmlRatio);
                const clarity = computeClarityScore(item);
                const tone = classifyToneConsistency(item);
                const missingInfo = classifyMissingInfo(item);

                return (
                  <tr
                    key={index}
                    className={item.success ? 'success-row' : 'error-row'}
                  >
                    <td className="url-cell">
                      <a
                        href={item.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.url || 'No URL'}
                      </a>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#9ca3af',
                          marginTop: '2px',
                        }}
                      >
                        {formatTimestamp(item.timestamp)}
                      </div>
                    </td>
                    <td
                      className="title-cell"
                      title={item.title || 'No title'}
                    >
                      {item.title || 'No title'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {renderQualityBadge(
                          sentenceInfo.label,
                          sentenceInfo.level
                        )}
                        {item.averageSentenceLength !== null &&
                          item.averageSentenceLength !== undefined && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: '#9ca3af',
                              }}
                            >
                              {item.averageSentenceLength.toFixed(1)} words /
                              sentence
                            </span>
                          )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {renderQualityBadge(
                          paragraphInfo.label,
                          paragraphInfo.level
                        )}
                        {item.averageParagraphLength !== null &&
                          item.averageParagraphLength !== undefined && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: '#9ca3af',
                              }}
                            >
                              {item.averageParagraphLength.toFixed(1)} words /
                              paragraph
                            </span>
                          )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {renderQualityBadge(
                          keywordInfo.label,
                          keywordInfo.level
                        )}
                        {item.keywordDensity !== null &&
                          item.keywordDensity !== undefined && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: '#9ca3af',
                              }}
                            >
                              {item.keywordDensity.toFixed(2)}% density
                            </span>
                          )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {renderQualityBadge(
                          clarity.label,
                          clarity.level
                        )}
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: '#9ca3af',
                          }}
                        >
                          Score: {clarity.score.toFixed(0)}/100
                        </span>
                      </div>
                    </td>
                    <td>
                      {renderQualityBadge(tone.label, tone.level)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {renderQualityBadge(ratioInfo.label, ratioInfo.level)}
                        {item.textToHtmlRatio !== null &&
                          item.textToHtmlRatio !== undefined && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: '#9ca3af',
                              }}
                            >
                              {item.textToHtmlRatio.toFixed(2)}% text
                            </span>
                          )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {renderQualityBadge(
                          missingInfo.label,
                          missingInfo.level
                        )}
                        {item.thinContent && item.thinContentReason && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: '#fca5a5',
                            }}
                          >
                            {item.thinContentReason}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
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
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="page-btn"
          >
            Previous
          </button>

          <span className="page-info">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

      {serverTotal !== null && data.length < serverTotal && initialSessionId && (
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
  );
};

export default TextQualityAnalyzer;

