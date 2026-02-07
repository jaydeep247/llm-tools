import React from 'react';
import CompetitorMentionsList from '../module_C/aeo/CompetitorMentionsList';
import { SentimentTracking } from '../module_E/SentimentTracking';
import { AICitationRankingSection } from '../module_E/AICitationRankingSection';
import { apiService } from '../../services/api/api';

interface Competitor {
  name: string;
  count: number;
}

interface ModuleEProps {
  url: string;
  moduleEScores: any;
  moduleELoading: boolean;
  moduleEError: string | null;
  competitors: Competitor[];
  sessionId?: number | null;
  onRunAnalysis?: () => void;
}

const ModuleE: React.FC<ModuleEProps> = ({
  url,
  moduleEScores,
  moduleELoading,
  moduleEError,
  competitors,
  sessionId,
  onRunAnalysis,
}) => {
  // Track if we're attempting to fetch data to prevent duplicate requests
  const [isAttemptingFetch, setIsAttemptingFetch] = React.useState(false);
  
  // Brand for sentiment/visibility: prefer configured brand, never pass literal "Not Configured"
  const rawBrandFromScores = moduleEScores?.brand_metrics?.data?.brand_name;

  // ... (normalizedBrand, isConfiguredBrand, extractDomainFromUrl, websiteUrl logic stays same)

  // ...

  // In the rendering part:


  const normalizeBrand = (value?: string) => (value || '').trim();
  const isConfiguredBrand = (value?: string) => {
    const norm = normalizeBrand(value);
    return norm.length > 0 && norm.toLowerCase() !== 'not configured';
  };

  // Extract domain from URL as brand name fallback
  const extractDomainFromUrl = (urlString: string): string => {
    try {
      // Remove protocol if present
      let cleanUrl = urlString.replace(/^https?:\/\//i, '');
      // Remove trailing slashes and paths
      cleanUrl = cleanUrl.split('/')[0];
      // Remove www. prefix
      cleanUrl = cleanUrl.replace(/^www\./i, '');
      return cleanUrl.trim();
    } catch (e) {
      return urlString.trim();
    }
  };

  // Fallback: extract domain from website URL when no brand is configured
  const websiteUrl = (url || moduleEScores?.url || '').trim();
  const domainFromUrl = websiteUrl ? extractDomainFromUrl(websiteUrl) : '';

  const effectiveBrandName =
    (isConfiguredBrand(rawBrandFromScores) ? normalizeBrand(rawBrandFromScores) : '') ||
    (domainFromUrl ? domainFromUrl : '');

  // --- Brand Pulse State ---
  const [brandPulseData, setBrandPulseData] = React.useState<any>(null);
  const [brandPulseLoading, setBrandPulseLoading] = React.useState(false);
  const [brandPulseError, setBrandPulseError] = React.useState<string | null>(null);

  // Initialize brandPulseData from moduleEScores.brand_metrics when available
  React.useEffect(() => {
    if (moduleEScores?.brand_metrics && !brandPulseData) {
      // Handle both structures: brand_metrics.data or brand_metrics directly
      const brandData = moduleEScores.brand_metrics.data || moduleEScores.brand_metrics;
      if (brandData && (brandData.total_mentions !== undefined || brandData.sentiment)) {
        console.log('[ModuleE] Initializing brandPulseData from moduleEScores.brand_metrics', brandData);
        setBrandPulseData(brandData);
      }
    }
  }, [moduleEScores?.brand_metrics, brandPulseData]);

  const handleBrandPulseAnalysis = async () => {
    if (!effectiveBrandName) {
      setBrandPulseError('No brand name configured');
      return;
    }
    setBrandPulseLoading(true);
    setBrandPulseError(null);
    try {
      console.log('[ModuleE] Calling analyzeBrandPulse with:', {
        brandName: effectiveBrandName,
        sessionId: sessionId,
        url: url
      });
      const result = await apiService.analyzeBrandPulse(effectiveBrandName, sessionId || undefined, url);
      setBrandPulseData(result);
    } catch (error: any) {
      setBrandPulseError(error.message || 'Failed to analyze brand');
    } finally {
      setBrandPulseLoading(false);
    }
  };

  if (typeof window !== 'undefined') {
    console.log(
      '[ModuleE] brand → rawBrandFromScores:',
      JSON.stringify(rawBrandFromScores),
      'websiteUrl:',
      JSON.stringify(websiteUrl),
      'domainFromUrl:',
      JSON.stringify(domainFromUrl),
      'effectiveBrandName (sent to API):',
      JSON.stringify(effectiveBrandName)
    );
  }

  return (
    <div className="p-4" style={{ minHeight: 'auto' }}>
      {/* New Summary Table (Replaces Multi-Model Cards) */}
      {/* New Summary Table (Replaces Multi-Model Cards) */}
      {moduleEScores && moduleEScores.consistency !== undefined ? (
        <div className="mb-8 overflow-hidden rounded-xl border border-gray-800 bg-black shadow-lg">
          <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-4 flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h3 className="text-lg font-semibold text-white">Analysis Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="bg-gray-900 text-xs uppercase text-gray-400 font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4 border-b border-gray-800">Website Name</th>
                  <th className="px-6 py-4 border-b border-gray-800">Content Consistency</th>
                  <th className="px-6 py-4 border-b border-gray-800">Website Entity Depth</th>
                  <th className="px-6 py-4 border-b border-gray-800">Model-wise Performance</th>
                  <th className="px-6 py-4 border-b border-gray-800">Accuracy of Responses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                <tr className="hover:bg-gray-900/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-white border-r border-gray-800/50">
                    {url || moduleEScores.url || 'Unknown Website'}
                  </td>
                  <td className="px-6 py-4 border-r border-gray-800/50">
                    {(() => {
                      const consistency = moduleEScores?.consistency ?? moduleEScores?.module_scores?.consistency;
                      return (
                        <span className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-bold ${(consistency ?? 0) >= 80 ? 'bg-green-900/40 text-green-400 border border-green-800' :
                          (consistency ?? 0) >= 50 ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-800' :
                            'bg-red-900/40 text-red-400 border border-red-800'
                          }`}>
                          {consistency !== undefined && consistency !== null ? `${consistency}%` : 'N/A'}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 border-r border-gray-800/50">
                    {(() => {
                      const entityScore = moduleEScores?.entity_coverage?.score ?? moduleEScores?.score_entity_coverage;
                      return (
                        <span className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-bold ${(entityScore || 0) >= 80 ? 'bg-green-900/40 text-green-400 border border-green-800' :
                          (entityScore || 0) >= 50 ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-800' :
                            'bg-red-900/40 text-red-400 border border-red-800'
                          }`}>
                          {entityScore !== undefined ? `${entityScore}%` : 'N/A'}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 border-r border-gray-800/50">
                    {(() => {
                      const mwp = moduleEScores?.model_wise_performance ?? {
                        chatgpt: moduleEScores?.openai,
                        claude: moduleEScores?.claude,
                        gemini: moduleEScores?.gemini,
                      };
                      let chatgpt = mwp?.chatgpt ?? mwp?.openai ?? moduleEScores?.openai;
                      let claude = mwp?.claude ?? moduleEScores?.claude;
                      let gemini = mwp?.gemini ?? moduleEScores?.gemini;
                      const hasAny = chatgpt != null || claude != null || gemini != null;
                      if (!hasAny) return <span className="text-gray-500">N/A</span>;
                      
                      // 🔧 FIX: Handle 0% scores - indicate if API call failed
                      const fmt = (v: number | null, model?: string) => {
                        if (v === 0 && (model === 'claude' || model === 'chatgpt')) {
                          return <span className="text-amber-400 font-medium" title="API call may be processing or unavailable">⏳ 0%</span>;
                        }
                        return v == null ? <span className="text-gray-500">-</span> : (
                          <span className={v >= 80 ? 'text-green-400' : v >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                            {v}%
                          </span>
                        );
                      };
                      return (
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span>ChatGPT: {fmt(chatgpt ?? null, 'chatgpt')}</span>
                          <span>Claude: {fmt(claude ?? null, 'claude')}</span>
                          <span>Gemini: {fmt(gemini ?? null)}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const acc = moduleEScores?.response_accuracy;
                      let overall = acc?.overall ?? null;
                      let chatgpt = acc?.chatgpt ?? null;
                      let claude = acc?.claude ?? null;
                      let gemini = acc?.gemini ?? null;
                      const hasAny = overall != null || chatgpt != null || claude != null || gemini != null;
                      if (!hasAny) return <span className="text-gray-500">N/A</span>;
                      
                      // 🔧 FIX: Handle 0% accuracy - indicate if API call may have failed
                      const fmt = (v: number | null, model?: string) => {
                        if (v === 0 && (model === 'chatgpt' || model === 'claude')) {
                          return <span className="text-amber-400 font-medium" title="Model API may be processing or unavailable">⏳ 0%</span>;
                        }
                        return v == null ? <span className="text-gray-500">-</span> : (
                          <span className={v >= 80 ? 'text-green-400' : v >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                            {v}%
                          </span>
                        );
                      };
                      return (
                        <div className="flex flex-col gap-0.5 text-xs">
                          {overall != null && <span className="font-medium">Overall: {fmt(overall)}</span>}
                          <span>ChatGPT: {fmt(chatgpt ?? null, 'chatgpt')}</span>
                          <span>Claude: {fmt(claude ?? null, 'claude')}</span>
                          <span>Gemini: {fmt(gemini ?? null)}</span>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mb-8 p-6 bg-gray-900/30 rounded-lg border border-gray-800 border-dashed text-center">
          <h3 className="text-lg font-semibold text-gray-200 mb-2">Detailed Analysis Required</h3>
          <p className="text-gray-400 mb-4">Run a detailed website analysis to see Content Consistency, Entity Coverage, and Brand Pulse metrics.</p>
          {onRunAnalysis && !moduleELoading && (
            <button
              onClick={onRunAnalysis}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors"
            >
              Run Website Analysis
            </button>
          )}
        </div>
      )}

      {moduleELoading && (
        <div className="loading-state text-center p-8 bg-gray-800 rounded-lg border border-gray-700">
          <div className="spinner mx-auto mb-4 w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-300">Aggregating content and analyzing...</p>
        </div>
      )}

      {moduleEError && (
        <div className="error-message p-4 bg-red-900/50 border border-red-500 text-red-200 rounded-lg mt-4">
          ❌ Error: {moduleEError}
        </div>
      )}

      {/* AI Citation Ranking Section */}
      {/* Merge citation_metrics and ranking_metrics with entity_coverage so the UI can read all fields.
          entity_coverage is NOT nested inside ranking/citation_metrics, it's a sibling field in moduleEScores */}
      <AICitationRankingSection
        url={websiteUrl}
        sessionId={sessionId ?? undefined}
        savedCitationMetrics={(() => {
          if (!moduleEScores) return undefined;
          const ranking = moduleEScores.ranking_metrics ?? null;
          const citation = moduleEScores.citation_metrics ?? null;
          const entityCoverage = moduleEScores.entity_coverage ?? null;
          
          // If we have any of these metrics, merge them all together
          if (!ranking && !citation && !entityCoverage) return undefined;
          
          const merged = {
            ...(citation || {}),
            ...(ranking || {}),
            ...(entityCoverage ? { entity_coverage: entityCoverage } : {})
          };
          
          console.log('[ModuleE] Passing to AICitationRankingSection:', {
            hasRanking: !!ranking,
            hasCitation: !!citation,
            hasEntityCoverage: !!entityCoverage,
            mergedKeys: Object.keys(merged),
            entityCoverageScore: entityCoverage?.score
          });
          
          return merged as any;
        })()}
      />

      {/* Brand Pulse & Sentiment Section */}
      <div className="mt-8">
        <SentimentTracking
          brandName={effectiveBrandName}
          initialSentimentData={moduleEScores?.sentiment_metrics}
          initialVisibilityData={moduleEScores?.visibility_metrics}
        />
      </div>

      {moduleEScores && (
        <div className="mt-8 bg-gray-800 p-6 rounded-xl border border-gray-700">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-xl font-bold text-gray-200 flex items-center gap-2">
              <span>📢</span> Brand Pulse & Sentiment
              <span className="text-sm font-normal text-gray-400 ml-2">
                ({effectiveBrandName || 'Configured Brand'})
              </span>
            </h4>
            {!brandPulseLoading && (
              <button
                onClick={handleBrandPulseAnalysis}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
                disabled={brandPulseLoading}
              >
                {brandPulseData ? 'Re-run Analysis' : 'Run Analysis'}
              </button>
            )}
          </div>

          {brandPulseLoading && (
            <div className="text-center py-12 bg-gray-900/30 rounded-lg">
              <div className="spinner mx-auto mb-3 w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-400">Analyzing brand mentions and sentiment...</p>
            </div>
          )}

          {brandPulseError && (
            <div className="p-4 bg-red-900/30 border border-red-800 text-red-200 rounded-lg mb-4 text-center">
              ❌ {brandPulseError}
            </div>
          )}

          {!brandPulseLoading && !brandPulseData && !brandPulseError && (
            <div className="text-center py-12 bg-gray-900/30 rounded-lg border border-gray-800 border-dashed">
              <div className="text-4xl mb-3 opacity-30">📊</div>
              <p className="text-gray-400">
                Click <span className="text-blue-400 font-medium">Run Analysis</span> to fetch brand mentions and sentiment data.
              </p>
            </div>
          )}

          {brandPulseData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Sentiment & Mentions */}
              <div className="space-y-6">
                <div className="flex items-center gap-4 bg-gray-900/50 p-4 rounded-lg">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white">{brandPulseData.total_mentions}</div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">Total Mentions</div>
                  </div>
                  <div className="h-10 w-px bg-gray-700"></div>
                  <div className="flex-grow">
                    {brandPulseData.sentiment ? (
                      <>
                        <div className="text-sm text-gray-300 mb-1">Sentiment: <span className="font-bold text-white">{brandPulseData.sentiment.label}</span></div>
                        <div className="flex h-3 rounded-full overflow-hidden bg-gray-700 w-full">
                          <div style={{ width: `${((brandPulseData.sentiment.counts?.positive || 0) / (brandPulseData.total_mentions || 1)) * 100}%` }} className="bg-green-500 h-full" title="Positive"></div>
                          <div style={{ width: `${((brandPulseData.sentiment.counts?.neutral || 0) / (brandPulseData.total_mentions || 1)) * 100}%` }} className="bg-gray-400 h-full" title="Neutral"></div>
                          <div style={{ width: `${((brandPulseData.sentiment.counts?.negative || 0) / (brandPulseData.total_mentions || 1)) * 100}%` }} className="bg-red-500 h-full" title="Negative"></div>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-400">Sentiment data not available</div>
                    )}
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-bold text-gray-300 uppercase mb-3">Top Mentioning Sites</h5>
                  <div className="space-y-2">
                    {brandPulseData.top_sources ? brandPulseData.top_sources.slice(0, 5).map((source: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm p-2 bg-gray-750 rounded hover:bg-gray-700 transition-colors">
                        <span className="text-blue-400 truncate w-2/3">{source.domain}</span>
                        {source.count !== undefined && (
                          <span className="bg-gray-900 text-gray-300 px-2 py-0.5 rounded text-xs">{source.count}</span>
                        )}
                      </div>
                    )) : (
                      <div className="text-sm text-gray-400">No source data available</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Frequency Chart */}
              <div className="flex flex-col h-full">
                <h5 className="text-sm font-bold text-gray-300 uppercase mb-3 text-center">Mention Frequency (Last 12 Months)</h5>
                <div className="flex-grow relative h-48 bg-gray-900/30 p-2 rounded-lg border border-gray-700/50">
                  {(() => {
                    if (!brandPulseData.frequency_trend) {
                      return <div className="absolute inset-0 flex items-center justify-center text-gray-500">Frequency data not available</div>;
                    }
                    const trendData = brandPulseData.frequency_trend.slice(-12);
                    const data = trendData.map((p: any) => ({
                      date: new Date(p.date),
                      value: Number(p.count || 0)
                    }));

                    if (data.length === 0 || data.every((d: any) => d.value === 0)) {
                      return (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                          <div className="text-center">
                            <div className="text-3xl mb-2 opacity-50">📉</div>
                            <div className="text-xs text-gray-400">No activity recorded</div>
                          </div>
                        </div>
                      );
                    }

                    const yMax = Math.max(...data.map((d: any) => Number(d.value) || 0), 5);
                    const width = 100;
                    const height = 100;
                    const padding = 5;
                    const getY = (val: number) => {
                      const numVal = Number(val) || 0;
                      if (isNaN(numVal) || !isFinite(numVal)) return height - padding;
                      if (yMax === 0) return height - padding;
                      const y = height - padding - ((numVal / yMax) * (height - (padding * 2)));
                      return isNaN(y) ? height - padding : y;
                    };
                    const getX = (i: number) => {
                      if (data.length <= 1) return i === 0 ? padding : width - padding;
                      const x = (i / Math.max(data.length - 1, 1)) * (width - (padding * 2)) + padding;
                      return isNaN(x) || !isFinite(x) ? padding : x;
                    };

                    let areaPath = `M 0,${height}`;
                    let linePath = ``;

                    data.forEach((d: any, i: number) => {
                      const value = Number(d.value) || 0;
                      const x = getX(i);
                      const y = getY(value);
                      // Ensure x and y are valid numbers
                      if (isNaN(x) || !isFinite(x) || isNaN(y) || !isFinite(y)) {
                        return; // Skip invalid points
                      }
                      if (i === 0) {
                        linePath += `M ${x},${y}`;
                        areaPath += ` L ${x},${y}`;
                      } else {
                        linePath += ` L ${x},${y}`;
                        areaPath += ` L ${x},${y}`;
                      }
                    });
                    areaPath += ` L ${width},${height} Z`;

                    return (
                      <div className="w-full h-full relative" style={{ minWidth: 0 }}>
                        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                          <defs>
                            <linearGradient id="freqGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.6} />
                              <stop offset="90%" stopColor="#3B82F6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          {[0.25, 0.5, 0.75, 1].map(tick => (
                            <line key={tick} x1="0" x2={width} y1={getY(yMax * tick)} y2={getY(yMax * tick)} stroke="#374151" strokeDasharray="2,2" strokeWidth="0.5" />
                          ))}
                          <path d={areaPath} fill="url(#freqGradient)" />
                          <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                          {data.map((d: any, i: number) => {
                            const value = Number(d.value) || 0;
                            const x = getX(i);
                            const y = getY(value);
                            // Skip rendering if coordinates are invalid
                            if (isNaN(x) || !isFinite(x) || isNaN(y) || !isFinite(y)) {
                              return null;
                            }
                            return (
                              <circle key={i} cx={x} cy={y} r={1.5} fill="#fff" stroke="#2563EB" strokeWidth="1" className="hover:r-4 transition-all">
                                <title>{value} mentions in {d.date.toLocaleString('default', { month: 'short' })}</title>
                              </circle>
                            );
                          })}
                        </svg>
                        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[9px] text-gray-500 transform translate-y-full pt-1">
                          {data.filter((_: any, i: number) => i % 2 === 0).map((d: any, i: number) => (
                            <span key={i}>{d.date.toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
                          ))}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[8px] text-gray-600 transform translate-y-full pt-3">
                          <span>{data[0].date.getFullYear()}</span>
                          {data[0].date.getFullYear() !== data[data.length - 1].date.getFullYear() && (
                            <span>{data[data.length - 1].date.getFullYear()}</span>
                          )}
                        </div>
                        <div className="absolute top-0 left-0 -ml-6 text-[9px] text-gray-500">{yMax}</div>
                        <div className="absolute bottom-0 left-0 -ml-6 text-[9px] text-gray-500">0</div>
                      </div>
                    );
                  })()}
                </div>
                <div className="text-center text-xs text-gray-500 mt-6">Monthly Volume Trend</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Competitor Mentions: Share of Voice %, Model-wise breakdown, Trend over time */}
      {(() => {
        const validCompetitorNames = (competitors || [])
          .map((c) => c?.name?.trim())
          .filter(
            (n) =>
              n &&
              n.toLowerCase() !== 'no data' &&
              n.toLowerCase() !== 'not configured' &&
              n.toLowerCase() !== 'no competitors found'
          );

        // ALWAYS render the section, let the component handle the empty state
        // or render a specific empty state if the list is technically empty but we want to show the container

        const brandTotalMentions = brandPulseData?.total_mentions ?? 0;
        const brandFrequencyTrend = brandPulseData?.frequency_trend ?? [];

        return (
          <div className="mt-8">
            <CompetitorMentionsList
              competitors={validCompetitorNames}
              brandTotalMentions={typeof brandTotalMentions === 'number' ? brandTotalMentions : 0}
              brandFrequencyTrend={Array.isArray(brandFrequencyTrend) ? brandFrequencyTrend : []}
              brandName={effectiveBrandName}
              url={websiteUrl}
              sessionId={sessionId}
              savedData={moduleEScores?.visibility_metrics}
              savedSov={moduleEScores?.share_of_voice}
            />
          </div>
        );
      })()}
    </div>
  );
};

export default ModuleE;