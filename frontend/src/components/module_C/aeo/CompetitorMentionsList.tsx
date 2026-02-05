
import React, { useState, useEffect } from 'react';

interface CompetitorMention {
    name: string;
    mentions: number;
    sentiment: string;
    trend: { date: string; count: number }[];
}

interface CompetitorMentionsListProps {
    competitors: string[];
    brandTotalMentions?: number;
    brandFrequencyTrend?: { date?: string; count?: number }[];
    brandName?: string;
}

interface ShareOfVoiceData {
    overall: number;
    by_model: {
        [key: string]: {
            sov: number;
            brand_mentions: number;
            competitor_mentions: number;
            total_mentions: number;
            queries_analyzed: number;
        };
    };
}

const CompetitorMentionsList: React.FC<CompetitorMentionsListProps> = ({
    competitors,
    brandTotalMentions = 0,
    brandFrequencyTrend = [],
    brandName,
}) => {
    const [mentionsData, setMentionsData] = useState<CompetitorMention[]>([]);
    const [sovData, setSovData] = useState<ShareOfVoiceData | null>(null);
    const [loading, setLoading] = useState(false);
    const [sovLoading, setSovLoading] = useState(false);
    const [processedCount, setProcessedCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [hasRun, setHasRun] = useState(false);

    useEffect(() => {
        // Reset when competitors list changes drastically
        setMentionsData([]);
        setSovData(null);
        setProcessedCount(0);
        setError(null);
        setHasRun(false);
    }, [competitors, brandName]);

    const handleRunAnalysis = async () => {
        if (competitors.length === 0) return;

        setLoading(true);
        setSovLoading(brandName ? true : false); // Only show SOV loading if brand_name is provided
        setHasRun(true);
        setProcessedCount(0);
        setError(null);
        setMentionsData([]);
        setSovData(null);

        try {
            // Single API call: fetch both mentions data AND SOV if brand_name is provided
            const response = await fetch('/api/aeo/analyze-competitors-mentions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    competitors: competitors, // ALL competitors at once
                    ...(brandName && { brand_name: brandName }) // Include brand_name only if available
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success && result.data) {
                // Set mentions data
                setMentionsData(result.data);
                setProcessedCount(competitors.length);
            }

            // Set SOV data if available
            if (result.share_of_voice) {
                setSovData(result.share_of_voice);
            }

        } catch (err: any) {
            console.error("Error fetching competitor mentions:", err);
            setError(err.message);
        } finally {
            setLoading(false);
            setSovLoading(false);
        }
    };

    if (competitors.length === 0) return null;

    // Share of Voice: brand / (brand + competitors) * 100
    const competitorTotal = mentionsData.reduce((sum, c) => sum + (c.mentions || 0), 0);
    const totalMentions = (brandTotalMentions || 0) + competitorTotal;
    const shareOfVoice = totalMentions > 0 ? Math.round(((brandTotalMentions || 0) / totalMentions) * 100) : null;

    // SOV Trend: merge brand + competitor trends by date, compute SOV per month
    const sovTrendData = (() => {
        if (!Array.isArray(brandFrequencyTrend) || brandFrequencyTrend.length === 0) return [];
        const dateToBrand: Record<string, number> = {};
        for (const b of brandFrequencyTrend) {
            const d = b.date?.slice(0, 7) || '';
            if (d) dateToBrand[d] = (dateToBrand[d] || 0) + (b.count || 0);
        }
        const dateToCompetitor: Record<string, number> = {};
        for (const c of mentionsData) {
            for (const t of c.trend || []) {
                const d = t.date?.slice(0, 7) || '';
                if (d) dateToCompetitor[d] = (dateToCompetitor[d] || 0) + (t.count || 0);
            }
        }
        const allMonths = new Set([...Object.keys(dateToBrand), ...Object.keys(dateToCompetitor)]);
        const sorted = Array.from(allMonths).sort();
        return sorted.map((month) => {
            const b = dateToBrand[month] || 0;
            const comp = dateToCompetitor[month] || 0;
            const tot = b + comp;
            return { date: `${month}-01`, sov: tot > 0 ? Math.round((b / tot) * 100) : 0 };
        });
    })();

    return (
        <div className="competitor-mentions-section overflow-hidden rounded-xl border border-gray-800 bg-black shadow-lg">
            <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-4 flex items-center justify-between">
                <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    Competitor Mentions & Share of Voice
                </h4>
                <div className="flex items-center gap-4">
                    {loading && (
                        <span className="text-xs text-gray-400">
                            Processing {processedCount}/{competitors.length}...
                        </span>
                    )}
                    {!hasRun && !loading && (
                        <button
                            onClick={handleRunAnalysis}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
                        >
                            Run Analysis
                        </button>
                    )}
                </div>
            </div>
            <div className="p-6">
                {!hasRun && !loading && (
                    <div className="text-center py-12 bg-gray-900/30 rounded-lg border border-gray-800 border-dashed">
                        <div className="text-4xl mb-3 opacity-30">📊</div>
                        <p className="text-gray-400">
                            Click <span className="text-blue-400 font-medium">Run Analysis</span> to fetch competitor mentions and share of voice data.
                        </p>
                    </div>
                )}

                {(hasRun || loading) && (
                    <>
                        {/* Share of Voice (%) - Overall */}
                        {shareOfVoice != null && (
                            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-2">Share of Voice (%) - Overall</h5>
                                <p className="text-xs text-gray-400 mb-2">Your brand&apos;s share of total mentions vs. competitors (last 12 months)</p>
                                <div className={`text-3xl font-bold ${shareOfVoice >= 50 ? 'text-green-400' : shareOfVoice >= 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {shareOfVoice}%
                                </div>
                            </div>
                        )}

                        {/* Model-wise Share of Voice Breakdown */}
                        {sovData && sovData.by_model && Object.keys(sovData.by_model).length > 0 && (
                            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-3">
                                    Share of Voice - Model-wise Breakdown
                                </h5>
                                <p className="text-xs text-gray-400 mb-3">
                                    Your brand&apos;s share of mentions across AI models when answering discovery questions
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {Object.entries(sovData.by_model).map(([model, data]) => {
                                        const modelLabel = {
                                            chatgpt: 'ChatGPT',
                                            claude: 'Claude',
                                            gemini: 'Gemini'
                                        }[model] || model;

                                        return (
                                            <div
                                                key={model}
                                                className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-colors"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="text-sm font-semibold text-gray-300">{modelLabel}</div>
                                                    <div className={`text-xl font-bold ${data.sov >= 50
                                                        ? 'text-green-400'
                                                        : data.sov >= 25
                                                            ? 'text-yellow-400'
                                                            : 'text-red-400'
                                                        }`}>
                                                        {data.sov}%
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5 mt-3 pt-3 border-t border-gray-700/50">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-400">Brand mentions:</span>
                                                        <span className="text-gray-300 font-medium">{data.brand_mentions}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-400">Competitor mentions:</span>
                                                        <span className="text-gray-300 font-medium">{data.competitor_mentions}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-400">Total mentions:</span>
                                                        <span className="text-gray-300 font-medium">{data.total_mentions}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs pt-1 border-t border-gray-700/30">
                                                        <span className="text-gray-500">Queries analyzed:</span>
                                                        <span className="text-gray-500">{data.queries_analyzed}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Loading indicator for SOV */}
                        {sovLoading && brandName && (
                            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                                <div className="text-sm text-gray-400 flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                                    Calculating model-wise Share of Voice...
                                </div>
                            </div>
                        )}

                        {/* SOV Trend over time */}
                        {sovTrendData.length >= 2 && (
                            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-2">Share of Voice - Trend Over Time</h5>
                                <div className="h-24 flex items-end gap-0.5">
                                    {sovTrendData.map((d, i) => (
                                        <div
                                            key={d.date}
                                            className="flex-1 min-w-[4px] bg-blue-600 rounded-sm"
                                            style={{ height: `${Math.max(4, (d.sov / 100) * 80)}px` }}
                                            title={`${d.date.slice(0, 7)}: ${d.sov}%`}
                                        />
                                    ))}
                                </div>
                                <div className="flex justify-between mt-2 text-[10px] text-gray-500">
                                    <span>{sovTrendData[0]?.date?.slice(0, 7) || ''}</span>
                                    <span>{sovTrendData[sovTrendData.length - 1]?.date?.slice(0, 7) || ''}</span>
                                </div>
                            </div>
                        )}

                        <p className="text-sm text-gray-400 mb-4">
                            Number of competitor mentions, frequency and context for your top competitors (last 12 months). Compare with your brand&apos;s Total Mentions in Brand Pulse above.
                        </p>

                        {error && (
                            <div className="mb-4 p-4 bg-red-900/50 border border-red-500 text-red-200 rounded-lg text-sm">
                                Error: {error}
                            </div>
                        )}

                        {!loading && mentionsData.length === 0 && !error && (
                            <div className="mb-4 p-4 bg-yellow-900/30 border border-yellow-700/50 text-yellow-200 rounded-lg text-sm">
                                Analysis completed, but no mentions data found for the competitors.
                            </div>
                        )}

                        {mentionsData.length > 0 && (
                            <div className="mentions-table-container overflow-x-auto">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-700">
                                            <th className="px-4 py-3 text-xs font-bold uppercase text-gray-400">Competitor</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase text-gray-400">Mentions (12mo)</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase text-gray-400">Sentiment</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase text-gray-400">Frequency Trend</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mentionsData.map((comp, idx) => (
                                            <tr key={idx} className="border-b border-gray-800 hover:bg-gray-900/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-white">{comp.name}</td>
                                                <td className="px-4 py-3 text-gray-400">{comp.mentions.toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium ${comp.sentiment === 'Positive'
                                                            ? 'bg-green-900/40 text-green-400 border border-green-800'
                                                            : comp.sentiment === 'Negative'
                                                                ? 'bg-red-900/40 text-red-400 border border-red-800'
                                                                : comp.sentiment === 'No Data'
                                                                    ? 'bg-gray-800/50 text-gray-500 border border-gray-700'
                                                                    : 'bg-gray-700/50 text-gray-300 border border-gray-600'
                                                            }`}
                                                    >
                                                        {comp.sentiment}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-end h-6 gap-0.5">
                                                        {comp.trend && comp.trend.length > 0 ? (
                                                            comp.trend.map((t, i) => {
                                                                const maxCount = Math.max(...comp.trend.map((x) => x.count), 1);
                                                                const pct = (t.count / maxCount) * 100;
                                                                const barHeight = Math.max(4, (pct / 100) * 24);
                                                                return (
                                                                    <div
                                                                        key={i}
                                                                        className="w-1 bg-blue-600 rounded-sm flex-shrink-0"
                                                                        style={{ height: `${barHeight}px` }}
                                                                        title={`${t.date}: ${t.count}`}
                                                                    />
                                                                );
                                                            })
                                                        ) : (
                                                            <span className="text-xs text-gray-500">No trend data</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default CompetitorMentionsList;
