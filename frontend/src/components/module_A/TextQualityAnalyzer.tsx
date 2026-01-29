import React, { useEffect, useState } from 'react';
import { useLazyGetDataListQuery } from '../../store/api/module_A/dataApi';
import { useLazyGetPageContentQuery } from '../../store/api/module_A/pageContentApi';
import '../../pages/DataViewer.css';

interface CrawlData {
  id?: number;
  url: string;
  title: string;
  timestamp: string;
  success?: boolean;
  // Core text metrics from Module A (wordcount_analysis)
  totalWordCount?: number;
  visibleWordCount?: number;
  uniqueWordCount?: number;
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
  // Detailed content structure
  headingWordCountMapping?: Record<string, number> | null;
  sectionWordCountMapping?: Record<string, number> | null;
  sectionWordCountBreakdown?: Record<string, number> | null;
  duplicateContent?: boolean;
  duplicateWithUrls?: string[] | null;
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

  // Details modal state - separate states for each modal type
  const [sentenceModalItem, setSentenceModalItem] = useState<CrawlData | null>(null);
  const [paragraphModalItem, setParagraphModalItem] = useState<CrawlData | null>(null);
  const [keywordModalItem, setKeywordModalItem] = useState<CrawlData | null>(null);
  const [ratioModalItem, setRatioModalItem] = useState<CrawlData | null>(null);
  const [missingModalItem, setMissingModalItem] = useState<CrawlData | null>(null);

  const [getDataList, { isLoading: loading }] = useLazyGetDataListQuery();
  
  // Separate lazy queries for each modal - RTK Query handles caching automatically
  const [getSentenceContent, sentenceQuery] = useLazyGetPageContentQuery();
  const [getParagraphContent, paragraphQuery] = useLazyGetPageContentQuery();
  const [getKeywordContent, keywordQuery] = useLazyGetPageContentQuery();

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
        id: item.id,
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
        uniqueWordCount:
          item.uniqueWordCount ??
          item.unique_word_count ??
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
        // Detailed content structure
        headingWordCountMapping:
          item.headingWordCountMapping ??
          item.heading_word_count_mapping ??
          null,
        sectionWordCountMapping:
          item.sectionWordCountMapping ??
          item.section_word_count_mapping ??
          null,
        sectionWordCountBreakdown:
          item.sectionWordCountBreakdown ??
          item.section_word_count_breakdown ??
          null,
        duplicateContent:
          item.duplicateContent ??
          item.duplicate_content ??
          null,
        duplicateWithUrls:
          item.duplicateWithUrls ??
          item.duplicate_with_urls ??
          null,
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

  const openSentenceDetails = (item: CrawlData) => {
    setSentenceModalItem(item);
    if (item.id) {
      getSentenceContent({ pageId: item.id });
    }
  };

  const openParagraphDetails = (item: CrawlData) => {
    setParagraphModalItem(item);
    if (item.id) {
      getParagraphContent({ pageId: item.id });
    }
  };

  const openKeywordDetails = (item: CrawlData) => {
    setKeywordModalItem(item);
    if (item.id) {
      getKeywordContent({ pageId: item.id });
    }
  };

  const openRatioDetails = (item: CrawlData) => {
    setRatioModalItem(item);
  };

  const openMissingDetails = (item: CrawlData) => {
    setMissingModalItem(item);
  };

  const closeAllModals = () => {
    setSentenceModalItem(null);
    setParagraphModalItem(null);
    setKeywordModalItem(null);
    setRatioModalItem(null);
    setMissingModalItem(null);
  };

  const ViewDataButton = ({ onClick }: { onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 4,
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid rgba(102,126,234,0.5)',
        background: 'rgba(102,126,234,0.08)',
        color: '#c7d2fe',
        cursor: 'pointer',
        fontSize: 11,
        lineHeight: 1.2,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(102,126,234,0.18)';
        e.currentTarget.style.borderColor = 'rgba(129,140,248,0.9)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(102,126,234,0.08)';
        e.currentTarget.style.borderColor = 'rgba(102,126,234,0.5)';
      }}
    >
      <span>View data</span>
    </button>
  );

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
                        <ViewDataButton onClick={() => openSentenceDetails(item)} />
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
                        <ViewDataButton onClick={() => openParagraphDetails(item)} />
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
                        <ViewDataButton onClick={() => openKeywordDetails(item)} />
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
                        <ViewDataButton onClick={() => openRatioDetails(item)} />
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
                        <ViewDataButton onClick={() => openMissingDetails(item)} />
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

      {/* Sentence Length / Complexity Modal */}
      {sentenceModalItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={closeAllModals}
        >
          <div
            style={{
              background: 'rgba(15,23,42,0.98)',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.6)',
              maxWidth: 700,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              color: '#e5e7eb',
              boxShadow: '0 18px 45px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(148,163,184,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background:
                  'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(15,23,42,0.95))',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: 4 }}>
                  Sentence Analysis
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  Sentence Length & Complexity
                </div>
              </div>
              <button
                onClick={closeAllModals}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#e5e7eb',
                  fontSize: 22,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(148,163,184,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                padding: '16px 18px 20px',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  marginBottom: 14,
                  paddingBottom: 10,
                  borderBottom: '1px solid rgba(55,65,81,0.8)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  URL
                </div>
                <a
                  href={sentenceModalItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#60a5fa',
                    fontSize: '0.85rem',
                    wordBreak: 'break-all',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  {sentenceModalItem.url}
                </a>
              </div>

              <div style={{ fontSize: '0.9rem', display: 'grid', gap: 12 }}>
                {sentenceQuery.isLoading ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>
                    Loading sentence analysis...
                  </div>
                ) : sentenceQuery.isError ? (
                  <div style={{
                    padding: 12,
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.5)',
                    borderRadius: 8,
                    color: '#fca5a5',
                    fontSize: '0.85rem',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Unable to fetch page content</div>
                    <div>{(sentenceQuery.error as any)?.data?.error || (sentenceQuery.error as any)?.message || 'Failed to fetch page content'}</div>
                  </div>
                ) : sentenceQuery.data?.data?.sentences && sentenceQuery.data.data.sentences.length > 0 ? (
                  <>
                    <p style={{ margin: 0, color: '#d1d5db', marginBottom: 12 }}>
                      Sample sentences from the page showing word count distribution
                    </p>

                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: '#9ca3af',
                          marginBottom: 8,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        }}
                      >
                        Sample Sentences (showing 10 of {sentenceQuery.data.data.sentences.length})
                      </div>
                      <div
                        style={{
                          background: 'rgba(15,23,42,0.9)',
                          border: '1px solid rgba(55,65,81,0.9)',
                          borderRadius: 8,
                          padding: 12,
                          maxHeight: 400,
                          overflowY: 'auto',
                        }}
                      >
                        {sentenceQuery.data.data.sentences.slice(0, 10).map((sentence: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              marginBottom: 8,
                              padding: 8,
                              background: 'rgba(55,65,81,0.3)',
                              borderRadius: 4,
                            }}
                          >
                            <div style={{ fontSize: '0.8rem', color: '#d1d5db', marginBottom: 4, lineHeight: 1.6 }}>
                              {sentence.text}
                            </div>
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginTop: 6
                            }}>
                              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                                {sentence.wordCount} words
                              </span>
                              <span style={{ 
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: sentence.wordCount > 25 
                                  ? 'rgba(239,68,68,0.2)' 
                                  : sentence.wordCount > 20 
                                  ? 'rgba(245,158,11,0.2)'
                                  : 'rgba(16,185,129,0.2)',
                                color: sentence.wordCount > 25 
                                  ? '#fca5a5' 
                                  : sentence.wordCount > 20 
                                  ? '#facc15'
                                  : '#6ee7b7'
                              }}>
                                {sentence.wordCount > 25 ? 'Complex' : sentence.wordCount > 20 ? 'Moderate' : 'Simple'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, color: '#d1d5db' }}>
                    No sentence data available
                  </p>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  <MetricTile
                    label="Total sentences"
                    value={
                      sentenceModalItem.sentenceCount !== undefined &&
                      sentenceModalItem.sentenceCount !== null
                        ? sentenceModalItem.sentenceCount.toLocaleString()
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Average sentence length"
                    value={
                      sentenceModalItem.averageSentenceLength !== undefined &&
                      sentenceModalItem.averageSentenceLength !== null
                        ? `${sentenceModalItem.averageSentenceLength.toFixed(1)} words`
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Complexity"
                    value={
                      sentenceModalItem.averageSentenceLength
                        ? sentenceModalItem.averageSentenceLength > 25
                          ? 'Hard to read'
                          : sentenceModalItem.averageSentenceLength > 20
                          ? 'Complex'
                          : sentenceModalItem.averageSentenceLength >= 15
                          ? 'Good'
                          : 'Very short'
                        : '—'
                    }
                  />
                </div>

                <div style={{ 
                  marginTop: 16,
                  padding: 12,
                  background: 'rgba(59,130,246,0.12)',
                  border: '1px solid rgba(59,130,246,0.5)',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  color: '#93c5fd'
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>💡 Readability Tip</div>
                  <div>Ideal sentence length is 15-20 words. Longer sentences (20-25 words) add complexity, while very long sentences (&gt;25 words) may be hard to follow.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paragraph Structure Modal */}
      {paragraphModalItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={closeAllModals}
        >
          <div
            style={{
              background: 'rgba(15,23,42,0.98)',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.6)',
              maxWidth: 700,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              color: '#e5e7eb',
              boxShadow: '0 18px 45px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(148,163,184,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background:
                  'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(15,23,42,0.95))',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: 4 }}>
                  Text Quality Details
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  Paragraph Structure
                </div>
              </div>
              <button
                onClick={closeAllModals}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#e5e7eb',
                  fontSize: 22,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(148,163,184,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div
              style={{
                padding: '16px 18px 20px',
                overflowY: 'auto',
              }}
            >
              {/* URL */}
              <div
                style={{
                  marginBottom: 14,
                  paddingBottom: 10,
                  borderBottom: '1px solid rgba(55,65,81,0.8)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  URL
                </div>
                <a
                  href={paragraphModalItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#60a5fa',
                    fontSize: '0.85rem',
                    wordBreak: 'break-all',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  {paragraphModalItem.url}
                </a>
              </div>

              {/* Body */}
              <div style={{ fontSize: '0.9rem', display: 'grid', gap: 12 }}>
                {paragraphQuery.isLoading ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>
                    Loading actual page content...
                  </div>
                ) : paragraphQuery.isError ? (
                  <div style={{
                    padding: 12,
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.5)',
                    borderRadius: 8,
                    color: '#fca5a5',
                    fontSize: '0.85rem',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Unable to fetch page content</div>
                    <div>{(paragraphQuery.error as any)?.data?.error || (paragraphQuery.error as any)?.message || 'Failed to fetch page content'}</div>
                  </div>
                ) : paragraphQuery.data?.data ? (
                  <>
                    <p style={{ margin: 0, color: '#d1d5db', marginBottom: 12 }}>
                      Actual content structure from the page
                    </p>

                    {/* Headings with their content */}
                    {paragraphQuery.data.data.headings && paragraphQuery.data.data.headings.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            fontSize: '0.85rem',
                            color: '#9ca3af',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                          }}
                        >
                          Page Headings & Content ({paragraphQuery.data.data.headings.length})
                        </div>
                        <div
                          style={{
                            background: 'rgba(15,23,42,0.9)',
                            border: '1px solid rgba(55,65,81,0.9)',
                            borderRadius: 8,
                            padding: 12,
                            maxHeight: 400,
                            overflowY: 'auto',
                          }}
                        >
                          {paragraphQuery.data.data.headings.map((heading: any, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                marginBottom: 16,
                                paddingBottom: 12,
                                borderBottom: idx < paragraphQuery.data.data.headings.length - 1 ? '1px solid rgba(55,65,81,0.5)' : 'none',
                                marginLeft: (heading.level - 1) * 12,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ 
                                  fontSize: '0.7rem', 
                                  color: '#6ee7b7',
                                  background: 'rgba(16,185,129,0.2)',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontWeight: 600 
                                }}>
                                  H{heading.level}
                                </span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e5e7eb' }}>
                                  {heading.text}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#60a5fa', marginLeft: 'auto' }}>
                                  {heading.wordCount} words
                                </span>
                              </div>
                              {heading.content && (
                                <div style={{ 
                                  fontSize: '0.8rem', 
                                  color: '#9ca3af',
                                  lineHeight: 1.6,
                                  marginTop: 6,
                                  paddingLeft: 12,
                                  borderLeft: '2px solid rgba(96,165,250,0.3)'
                                }}>
                                  {heading.content.substring(0, 200)}
                                  {heading.content.length > 200 && '...'}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Paragraphs */}
                    {paragraphQuery.data.data.paragraphs && paragraphQuery.data.data.paragraphs.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div
                          style={{
                            fontSize: '0.85rem',
                            color: '#9ca3af',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                          }}
                        >
                          Paragraphs ({paragraphQuery.data.data.paragraphs.length})
                        </div>
                        <div
                          style={{
                            background: 'rgba(15,23,42,0.9)',
                            border: '1px solid rgba(55,65,81,0.9)',
                            borderRadius: 8,
                            padding: 12,
                            maxHeight: 300,
                            overflowY: 'auto',
                          }}
                        >
                          {paragraphQuery.data.data.paragraphs.slice(0, 10).map((para: any, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                marginBottom: 12,
                                paddingBottom: 12,
                                borderBottom: idx < paragraphQuery.data.data.paragraphs.slice(0, 10).length - 1 ? '1px solid rgba(55,65,81,0.5)' : 'none',
                              }}
                            >
                              <div style={{ 
                                fontSize: '0.8rem', 
                                color: '#d1d5db',
                                lineHeight: 1.6,
                                marginBottom: 6
                              }}>
                                {para.text.substring(0, 150)}
                                {para.text.length > 150 && '...'}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#60a5fa' }}>
                                {para.wordCount} words
                              </div>
                            </div>
                          ))}
                          {paragraphQuery.data.data.paragraphs.length > 10 && (
                            <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
                              ... and {paragraphQuery.data.data.paragraphs.length - 10} more paragraphs
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ margin: 0, color: '#d1d5db' }}>
                    No paragraph data available
                  </p>
                )}

                {/* Stats */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  <MetricTile
                    label="Sentence count"
                    value={
                      paragraphModalItem.sentenceCount !== undefined &&
                      paragraphModalItem.sentenceCount !== null
                        ? paragraphModalItem.sentenceCount.toLocaleString()
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Paragraph count"
                    value={
                      paragraphModalItem.paragraphCount !== undefined &&
                      paragraphModalItem.paragraphCount !== null
                        ? paragraphModalItem.paragraphCount.toLocaleString()
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Average sentence length"
                    value={
                      paragraphModalItem.averageSentenceLength !== undefined &&
                      paragraphModalItem.averageSentenceLength !== null
                        ? `${paragraphModalItem.averageSentenceLength.toFixed(1)} words`
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Average paragraph length"
                    value={
                      paragraphModalItem.averageParagraphLength !== undefined &&
                      paragraphModalItem.averageParagraphLength !== null
                        ? `${paragraphModalItem.averageParagraphLength.toFixed(1)} words`
                        : '—'
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyword/Entity Usage Modal */}
      {keywordModalItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={closeAllModals}
        >
          <div
            style={{
              background: 'rgba(15,23,42,0.98)',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.6)',
              maxWidth: 700,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              color: '#e5e7eb',
              boxShadow: '0 18px 45px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(148,163,184,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background:
                  'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(15,23,42,0.95))',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: 4 }}>
                  Text Quality Details
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  Keyword / Entity Usage
                </div>
              </div>
              <button
                onClick={closeAllModals}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#e5e7eb',
                  fontSize: 22,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(148,163,184,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div
              style={{
                padding: '16px 18px 20px',
                overflowY: 'auto',
              }}
            >
              {/* URL */}
              <div
                style={{
                  marginBottom: 14,
                  paddingBottom: 10,
                  borderBottom: '1px solid rgba(55,65,81,0.8)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  URL
                </div>
                <a
                  href={keywordModalItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#60a5fa',
                    fontSize: '0.85rem',
                    wordBreak: 'break-all',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  {keywordModalItem.url}
                </a>
              </div>

              {/* Body */}
              <div style={{ fontSize: '0.9rem', display: 'grid', gap: 12 }}>
                {keywordQuery.isLoading ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>
                    Analyzing keywords...
                  </div>
                ) : keywordQuery.isError ? (
                  <div style={{
                    padding: 12,
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.5)',
                    borderRadius: 8,
                    color: '#fca5a5',
                    fontSize: '0.85rem',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Unable to fetch page content</div>
                    <div>{(keywordQuery.error as any)?.data?.error || (keywordQuery.error as any)?.message || 'Failed to fetch page content'}</div>
                  </div>
                ) : keywordQuery.data?.data?.topWords ? (
                  <>
                    <p style={{ margin: 0, color: '#d1d5db', marginBottom: 12 }}>
                      Top keywords found on this page
                    </p>

                    {/* Top Keywords */}
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: '#9ca3af',
                          marginBottom: 8,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        }}
                      >
                        Top 20 Keywords
                      </div>
                      <div
                        style={{
                          background: 'rgba(15,23,42,0.9)',
                          border: '1px solid rgba(55,65,81,0.9)',
                          borderRadius: 8,
                          padding: 12,
                          maxHeight: 350,
                          overflowY: 'auto',
                        }}
                      >
                        {keywordQuery.data.data.topWords.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 0',
                              borderBottom: idx < keywordQuery.data.data.topWords.length - 1 ? '1px solid rgba(55,65,81,0.5)' : 'none',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                              <span style={{ 
                                fontSize: '0.7rem', 
                                color: '#9ca3af',
                                minWidth: 24,
                                textAlign: 'right'
                              }}>
                                #{idx + 1}
                              </span>
                              <span style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: 500 }}>
                                {item.word}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                              <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 600 }}>
                                {item.count}×
                              </span>
                              <span style={{ 
                                fontSize: '0.75rem', 
                                color: '#6ee7b7',
                                background: 'rgba(16,185,129,0.2)',
                                padding: '2px 8px',
                                borderRadius: 4,
                                minWidth: 50,
                                textAlign: 'center'
                              }}>
                                {item.percentage}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, color: '#d1d5db' }}>
                    No keyword data available
                  </p>
                )}

                {/* Stats */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    marginTop: 8,
                  }}
                >
                  <MetricTile
                    label="Visible word count"
                    value={
                      keywordModalItem.visibleWordCount !== undefined &&
                      keywordModalItem.visibleWordCount !== null
                        ? keywordModalItem.visibleWordCount.toLocaleString()
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Total word count"
                    value={
                      keywordModalItem.totalWordCount !== undefined &&
                      keywordModalItem.totalWordCount !== null
                        ? keywordModalItem.totalWordCount.toLocaleString()
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Unique words"
                    value={
                      keywordModalItem.uniqueWordCount !== undefined &&
                      keywordModalItem.uniqueWordCount !== null
                        ? keywordModalItem.uniqueWordCount.toLocaleString()
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Keyword density"
                    value={
                      keywordModalItem.keywordDensity !== undefined &&
                      keywordModalItem.keywordDensity !== null
                        ? `${keywordModalItem.keywordDensity.toFixed(2)}%`
                        : '—'
                    }
                  />
                </div>

                {/* Word Diversity Ratio */}
                {keywordModalItem.uniqueWordCount && keywordModalItem.visibleWordCount && (
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: '#9ca3af',
                        marginBottom: 8,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Word Diversity
                    </div>
                    <div
                      style={{
                        background: 'rgba(15,23,42,0.9)',
                        border: '1px solid rgba(55,65,81,0.9)',
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.85rem', color: '#d1d5db' }}>
                          Unique words ratio
                        </span>
                        <span style={{ fontSize: '0.9rem', color: '#60a5fa', fontWeight: 600 }}>
                          {((keywordModalItem.uniqueWordCount / keywordModalItem.visibleWordCount) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ 
                        width: '100%', 
                        height: 8, 
                        background: 'rgba(55,65,81,0.5)',
                        borderRadius: 4,
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          width: `${(keywordModalItem.uniqueWordCount / keywordModalItem.visibleWordCount) * 100}%`, 
                          height: '100%',
                          background: 'linear-gradient(90deg, #10b981, #6ee7b7)',
                          borderRadius: 4
                        }} />
                      </div>
                      <p style={{ marginTop: 8, fontSize: '0.75rem', color: '#9ca3af', margin: '8px 0 0 0' }}>
                        Higher ratios (40-60%) indicate diverse vocabulary. Lower ratios may suggest repetitive content.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Text Ratio Modal */}
      {ratioModalItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={closeAllModals}
        >
          <div
            style={{
              background: 'rgba(15,23,42,0.98)',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.6)',
              maxWidth: 700,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              color: '#e5e7eb',
              boxShadow: '0 18px 45px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(148,163,184,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background:
                  'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(15,23,42,0.95))',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: 4 }}>
                  Text Quality Details
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  Text Ratio / Content vs Code
                </div>
              </div>
              <button
                onClick={closeAllModals}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#e5e7eb',
                  fontSize: 22,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(148,163,184,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div
              style={{
                padding: '16px 18px 20px',
                overflowY: 'auto',
              }}
            >
              {/* URL */}
              <div
                style={{
                  marginBottom: 14,
                  paddingBottom: 10,
                  borderBottom: '1px solid rgba(55,65,81,0.8)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  URL
                </div>
                <a
                  href={ratioModalItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#60a5fa',
                    fontSize: '0.85rem',
                    wordBreak: 'break-all',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  {ratioModalItem.url}
                </a>
              </div>

              {/* Body */}
              <div style={{ fontSize: '0.9rem', display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, color: '#d1d5db' }}>
                  Text ratio compares how much readable text exists relative to the total HTML.
                </p>

                {/* Stats */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    marginTop: 8,
                  }}
                >
                  <MetricTile
                    label="Text ratio (text vs HTML)"
                    value={
                      ratioModalItem.textToHtmlRatio !== undefined &&
                      ratioModalItem.textToHtmlRatio !== null
                        ? `${ratioModalItem.textToHtmlRatio.toFixed(2)}%`
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Visible word count"
                    value={
                      ratioModalItem.visibleWordCount !== undefined &&
                      ratioModalItem.visibleWordCount !== null
                        ? ratioModalItem.visibleWordCount.toLocaleString()
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Content type"
                    value={ratioModalItem.contentType || 'Unknown'}
                  />
                </div>

                {/* Text Ratio Visualization */}
                {ratioModalItem.textToHtmlRatio !== undefined && ratioModalItem.textToHtmlRatio !== null && (
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: '#9ca3af',
                        marginBottom: 8,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Content vs Code
                    </div>
                    <div
                      style={{
                        background: 'rgba(15,23,42,0.9)',
                        border: '1px solid rgba(55,65,81,0.9)',
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.85rem', color: '#6ee7b7' }}>Text Content</span>
                          <span style={{ fontSize: '0.85rem', color: '#6ee7b7', fontWeight: 600 }}>
                            {ratioModalItem.textToHtmlRatio.toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ 
                          width: '100%', 
                          height: 24, 
                          background: 'rgba(55,65,81,0.5)',
                          borderRadius: 4,
                          overflow: 'hidden',
                          display: 'flex'
                        }}>
                          <div style={{ 
                            width: `${Math.min(ratioModalItem.textToHtmlRatio, 100)}%`, 
                            height: '100%',
                            background: 'linear-gradient(90deg, #10b981, #6ee7b7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            color: '#fff',
                            fontWeight: 600
                          }}>
                            {ratioModalItem.textToHtmlRatio > 10 && 'Text'}
                          </div>
                          <div style={{ 
                            flex: 1,
                            height: '100%',
                            background: 'rgba(239,68,68,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            color: '#fca5a5',
                            fontWeight: 600
                          }}>
                            {ratioModalItem.textToHtmlRatio < 90 && 'HTML/Code'}
                          </div>
                        </div>
                      </div>

                      <div style={{ 
                        marginTop: 12,
                        padding: 10,
                        background: ratioModalItem.textToHtmlRatio > 20 
                          ? 'rgba(16,185,129,0.12)' 
                          : ratioModalItem.textToHtmlRatio >= 10 
                          ? 'rgba(245,158,11,0.12)'
                          : 'rgba(239,68,68,0.12)',
                        border: `1px solid ${
                          ratioModalItem.textToHtmlRatio > 20 
                            ? 'rgba(16,185,129,0.6)' 
                            : ratioModalItem.textToHtmlRatio >= 10 
                            ? 'rgba(245,158,11,0.6)'
                            : 'rgba(239,68,68,0.6)'
                        }`,
                        borderRadius: 6,
                        fontSize: '0.8rem',
                        color: ratioModalItem.textToHtmlRatio > 20 
                          ? '#6ee7b7' 
                          : ratioModalItem.textToHtmlRatio >= 10 
                          ? '#facc15'
                          : '#fca5a5'
                      }}>
                        {ratioModalItem.textToHtmlRatio > 20 && (
                          <span>✓ Healthy text ratio. Good balance of content to code.</span>
                        )}
                        {ratioModalItem.textToHtmlRatio >= 10 && ratioModalItem.textToHtmlRatio <= 20 && (
                          <span>⚠ Low content ratio. Consider adding more text content.</span>
                        )}
                        {ratioModalItem.textToHtmlRatio < 10 && (
                          <span>✗ Very low text ratio. Page is template-heavy with minimal content.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <p style={{ marginTop: 8, fontSize: '0.8rem', color: '#9ca3af' }}>
                  Healthy pages usually have a text ratio above ~20%. Very low ratios often indicate
                  template-heavy or code-heavy pages.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Missing/Weak Info Modal */}
      {missingModalItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={closeAllModals}
        >
          <div
            style={{
              background: 'rgba(15,23,42,0.98)',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.6)',
              maxWidth: 700,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              color: '#e5e7eb',
              boxShadow: '0 18px 45px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(148,163,184,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background:
                  'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(15,23,42,0.95))',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: 4 }}>
                  Text Quality Details
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  Missing or Weak Information
                </div>
              </div>
              <button
                onClick={closeAllModals}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#e5e7eb',
                  fontSize: 22,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(148,163,184,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div
              style={{
                padding: '16px 18px 20px',
                overflowY: 'auto',
              }}
            >
              {/* URL */}
              <div
                style={{
                  marginBottom: 14,
                  paddingBottom: 10,
                  borderBottom: '1px solid rgba(55,65,81,0.8)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  URL
                </div>
                <a
                  href={missingModalItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#60a5fa',
                    fontSize: '0.85rem',
                    wordBreak: 'break-all',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  {missingModalItem.url}
                </a>
              </div>

              {/* Body */}
              <div style={{ fontSize: '0.9rem', display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, color: '#d1d5db' }}>
                  These numbers highlight whether the page might be missing important content.
                </p>

                {/* Stats */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    marginTop: 8,
                  }}
                >
                  <MetricTile
                    label="Visible word count"
                    value={
                      missingModalItem.visibleWordCount !== undefined &&
                      missingModalItem.visibleWordCount !== null
                        ? missingModalItem.visibleWordCount.toLocaleString()
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Paragraph count"
                    value={
                      missingModalItem.paragraphCount !== undefined &&
                      missingModalItem.paragraphCount !== null
                        ? missingModalItem.paragraphCount.toLocaleString()
                        : '—'
                    }
                  />
                  <MetricTile
                    label="Thin content flag"
                    value={
                      missingModalItem.thinContent === true
                        ? 'Yes'
                        : missingModalItem.thinContent === false
                        ? 'No'
                        : 'Unknown'
                    }
                  />
                  <MetricTile
                    label="Duplicate content"
                    value={
                      missingModalItem.duplicateContent === true
                        ? 'Yes'
                        : missingModalItem.duplicateContent === false
                        ? 'No'
                        : 'Unknown'
                    }
                  />
                </div>

                {/* Content Quality Assessment */}
                {missingModalItem.visibleWordCount !== undefined && missingModalItem.visibleWordCount !== null && (
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: '#9ca3af',
                        marginBottom: 8,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Content Quality Assessment
                    </div>
                    <div
                      style={{
                        background: 'rgba(15,23,42,0.9)',
                        border: '1px solid rgba(55,65,81,0.9)',
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: '0.85rem', color: '#d1d5db', marginBottom: 6 }}>
                          Word Count Status
                        </div>
                        <div style={{ 
                          width: '100%', 
                          height: 8, 
                          background: 'rgba(55,65,81,0.5)',
                          borderRadius: 4,
                          overflow: 'hidden',
                          position: 'relative'
                        }}>
                          {/* Progress bar showing word count against benchmarks */}
                          <div style={{ 
                            width: `${Math.min((missingModalItem.visibleWordCount / 1000) * 100, 100)}%`, 
                            height: '100%',
                            background: missingModalItem.visibleWordCount < 300 
                              ? 'linear-gradient(90deg, #ef4444, #fca5a5)'
                              : missingModalItem.visibleWordCount < 700 
                              ? 'linear-gradient(90deg, #f59e0b, #facc15)'
                              : 'linear-gradient(90deg, #10b981, #6ee7b7)',
                            borderRadius: 4
                          }} />
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          marginTop: 6,
                          fontSize: '0.7rem',
                          color: '#9ca3af',
                          position: 'relative'
                        }}>
                          <span>0</span>
                          <span style={{ position: 'absolute', left: '30%' }}>300</span>
                          <span style={{ position: 'absolute', left: '70%' }}>700</span>
                          <span>1000+</span>
                        </div>
                      </div>

                      <ul style={{ margin: '12px 0 0 0', paddingLeft: 20, fontSize: '0.8rem', color: '#9ca3af' }}>
                        <li style={{ marginBottom: 6, color: missingModalItem.visibleWordCount < 300 ? '#fca5a5' : '#9ca3af' }}>
                          <span style={{ fontWeight: 600 }}>&lt; 300 words</span>: Likely thin content
                        </li>
                        <li style={{ marginBottom: 6, color: missingModalItem.visibleWordCount >= 300 && missingModalItem.visibleWordCount < 700 ? '#facc15' : '#9ca3af' }}>
                          <span style={{ fontWeight: 600 }}>300-700 words</span>: Acceptable, could be improved
                        </li>
                        <li style={{ color: missingModalItem.visibleWordCount >= 700 ? '#6ee7b7' : '#9ca3af' }}>
                          <span style={{ fontWeight: 600 }}>700+ words</span>: Strong content coverage
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Thin Content Reason */}
                {missingModalItem.thinContentReason && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(239,68,68,0.12)',
                      border: '1px solid rgba(239,68,68,0.5)',
                      fontSize: '0.85rem',
                      color: '#fecaca',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        marginBottom: 4,
                        color: '#fecaca',
                      }}
                    >
                      Thin content reason
                    </div>
                    <div>{missingModalItem.thinContentReason}</div>
                  </div>
                )}

                {/* Duplicate Content Warning */}
                {missingModalItem.duplicateContent && missingModalItem.duplicateWithUrls && missingModalItem.duplicateWithUrls.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.5)',
                      fontSize: '0.85rem',
                      color: '#fde68a',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        marginBottom: 8,
                        color: '#fde68a',
                      }}
                    >
                      ⚠ Duplicate Content Detected
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      This page has duplicate or very similar content with the following URLs:
                    </div>
                    <div style={{ 
                      maxHeight: 150, 
                      overflowY: 'auto',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 4,
                      padding: 8
                    }}>
                      {missingModalItem.duplicateWithUrls.map((url, idx) => (
                        <div key={idx} style={{ marginBottom: 4, fontSize: '0.8rem' }}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#60a5fa', textDecoration: 'none', wordBreak: 'break-all' }}
                            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                          >
                            {url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricTile: React.FC<{ label: string; value: string | number }> = ({
  label,
  value,
}) => (
  <div
    style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: 'rgba(15,23,42,0.9)',
      border: '1px solid rgba(55,65,81,0.9)',
    }}
  >
    <div
      style={{
        fontSize: '0.75rem',
        color: '#9ca3af',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e5e7eb' }}>
      {value ?? '—'}
    </div>
  </div>
);

export default TextQualityAnalyzer;

