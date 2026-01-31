import React from 'react';
import CompetitorMentionsList from '../module_C/aeo/CompetitorMentionsList';
import { SentimentTracking } from '../module_E/SentimentTracking';
import { AICitationRankingSection } from '../module_E/AICitationRankingSection';

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
}

const ModuleE: React.FC<ModuleEProps> = ({
  url,
  moduleEScores,
  moduleELoading,
  moduleEError,
  competitors
}) => {
  // Brand for sentiment/visibility: prefer configured brand, never pass literal "Not Configured"
  const rawBrandFromScores = moduleEScores?.brand_metrics?.data?.brand_name;
  const rawBrandFromCompetitor = competitors[0]?.name;

  const normalizeBrand = (value?: string) => (value || '').trim();
  const isConfiguredBrand = (value?: string) => {
    const norm = normalizeBrand(value);
    return norm.length > 0 && norm.toLowerCase() !== 'not configured';
  };

  // Fallback: use website URL when no brand/competitor is configured (API accepts brand name or URL)
  const websiteUrl = (url || moduleEScores?.url || '').trim();
  const effectiveBrandName =
    (isConfiguredBrand(rawBrandFromScores) ? normalizeBrand(rawBrandFromScores) : '') ||
    (isConfiguredBrand(rawBrandFromCompetitor) ? normalizeBrand(rawBrandFromCompetitor) : '') ||
    (websiteUrl ? websiteUrl : '');

  if (typeof window !== 'undefined') {
    console.log(
      '[ModuleE] brand → rawBrandFromScores:',
      JSON.stringify(rawBrandFromScores),
      'rawBrandFromCompetitor:',
      JSON.stringify(rawBrandFromCompetitor),
      'websiteUrl:',
      JSON.stringify(websiteUrl),
      'effectiveBrandName (sent to API):',
      JSON.stringify(effectiveBrandName)
    );
  }

  return (
    <div className="p-4" style={{ minHeight: 'auto' }}>
      {/* New Summary Table (Replaces Multi-Model Cards) */}
      {moduleEScores && (
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
                  <th className="px-6 py-4 border-b border-gray-800">Entity Coverage</th>
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
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-bold ${(moduleEScores.entity_coverage?.score || 0) >= 80 ? 'bg-green-900/40 text-green-400 border border-green-800' :
                      (moduleEScores.entity_coverage?.score || 0) >= 50 ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-800' :
                        'bg-red-900/40 text-red-400 border border-red-800'
                      }`}>
                      {moduleEScores.entity_coverage?.score !== undefined ? `${moduleEScores.entity_coverage.score}%` : 'N/A'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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
      <AICitationRankingSection url={websiteUrl} />

      {/* Brand Pulse & Sentiment Section */}
      <div className="mt-8">
        <SentimentTracking brandName={effectiveBrandName} />
      </div>

      {moduleEScores && moduleEScores.brand_metrics && (
        <div className="mt-8 bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h4 className="text-xl font-bold mb-4 text-gray-200 flex items-center gap-2">
            <span>📢</span> Brand Pulse & Sentiment
            <span className="text-sm font-normal text-gray-400 ml-2">({moduleEScores.brand_metrics.data?.brand_name})</span>
          </h4>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Sentiment & Mentions */}
            <div className="space-y-6">
              <div className="flex items-center gap-4 bg-gray-900/50 p-4 rounded-lg">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">{moduleEScores.brand_metrics.data?.total_mentions}</div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Total Mentions</div>
                </div>
                <div className="h-10 w-px bg-gray-700"></div>
                <div className="flex-grow">
                  {moduleEScores.brand_metrics.data?.sentiment ? (
                    <>
                      <div className="text-sm text-gray-300 mb-1">Sentiment: <span className="font-bold text-white">{moduleEScores.brand_metrics.data.sentiment.label}</span></div>
                      <div className="flex h-3 rounded-full overflow-hidden bg-gray-700 w-full">
                        <div style={{ width: `${((moduleEScores.brand_metrics.data.sentiment.counts?.positive || 0) / (moduleEScores.brand_metrics.data.total_mentions || 1)) * 100}%` }} className="bg-green-500 h-full" title="Positive"></div>
                        <div style={{ width: `${((moduleEScores.brand_metrics.data.sentiment.counts?.neutral || 0) / (moduleEScores.brand_metrics.data.total_mentions || 1)) * 100}%` }} className="bg-gray-400 h-full" title="Neutral"></div>
                        <div style={{ width: `${((moduleEScores.brand_metrics.data.sentiment.counts?.negative || 0) / (moduleEScores.brand_metrics.data.total_mentions || 1)) * 100}%` }} className="bg-red-500 h-full" title="Negative"></div>
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
                  {moduleEScores.brand_metrics.data?.top_sources ? moduleEScores.brand_metrics.data.top_sources.slice(0, 5).map((source: any, i: number) => (
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
                  if (!moduleEScores.brand_metrics?.data?.frequency_trend) {
                    return <div className="absolute inset-0 flex items-center justify-center text-gray-500">Frequency data not available</div>;
                  }
                  const trendData = moduleEScores.brand_metrics.data.frequency_trend.slice(-12);
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

                  const yMax = Math.max(...data.map((d: any) => d.value), 5);
                  const width = 100;
                  const height = 100;
                  const padding = 5;
                  const getY = (val: number) => height - padding - ((val / yMax) * (height - (padding * 2)));
                  const getX = (i: number) => (i / (data.length - 1)) * width;

                  let areaPath = `M 0,${height}`;
                  let linePath = ``;

                  data.forEach((d: any, i: number) => {
                    const x = getX(i);
                    const y = getY(d.value);
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
                        {data.map((d: any, i: number) => (
                          <circle key={i} cx={getX(i)} cy={getY(d.value)} r={1.5} fill="#fff" stroke="#2563EB" strokeWidth="1" className="hover:r-4 transition-all">
                            <title>{d.value} mentions in {d.date.toLocaleString('default', { month: 'short' })}</title>
                          </circle>
                        ))}
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
        </div>
      )}
    </div>
  );
};

export default ModuleE;