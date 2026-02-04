
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
}

const CompetitorMentionsList: React.FC<CompetitorMentionsListProps> = ({
    competitors,
    brandTotalMentions = 0,
    brandFrequencyTrend = [],
}) => {
    const [mentionsData, setMentionsData] = useState<CompetitorMention[]>([]);
    const [loading, setLoading] = useState(false);
    const [processedCount, setProcessedCount] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Reset when competitors list changes drastically
        setMentionsData([]);
        setProcessedCount(0);
        setError(null);

        if (competitors.length === 0) return;

        const fetchMentionsBatch = async () => {
            setLoading(true);
            const BATCH_SIZE = 5;

            try {
                for (let i = 0; i < competitors.length; i += BATCH_SIZE) {
                    const batch = competitors.slice(i, i + BATCH_SIZE);

                    const response = await fetch('/api/aeo/analyze-competitors-mentions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ competitors: batch })
                    });

                    if (!response.ok) {
                        throw new Error(`Batch failed: ${response.statusText}`);
                    }

                    const result = await response.json();
                    if (result.success && result.data) {
                        setMentionsData(prev => {
                            // Prevent duplicates if effect double-fires
                            const newNames = new Set(result.data.map((d: any) => d.name));
                            return [...prev.filter(d => !newNames.has(d.name)), ...result.data];
                        });
                        setProcessedCount(prev => Math.min(prev + batch.length, competitors.length));
                    }

                    // Small delay to be gentle on the API
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (err: any) {
                console.error("Error fetching competitor mentions:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchMentionsBatch();

    }, [competitors]); // Re-run if ALL competitors change (e.g. new analysis)

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
                {loading && (
                    <span className="text-xs text-gray-400">
                        Processing {processedCount}/{competitors.length}...
                    </span>
                )}
            </div>
            <div className="p-6">
                {/* Share of Voice (%) */}
                {shareOfVoice != null && (
                    <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                        <h5 className="text-sm font-bold text-gray-300 uppercase mb-2">Share of Voice (%)</h5>
                        <p className="text-xs text-gray-400 mb-2">Your brand&apos;s share of total mentions vs. competitors (last 12 months)</p>
                        <div className={`text-3xl font-bold ${shareOfVoice >= 50 ? 'text-green-400' : shareOfVoice >= 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {shareOfVoice}%
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
                                            className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium ${
                                                comp.sentiment === 'Positive'
                                                    ? 'bg-green-900/40 text-green-400 border border-green-800'
                                                    : comp.sentiment === 'Negative'
                                                    ? 'bg-red-900/40 text-red-400 border border-red-800'
                                                    : 'bg-gray-700/50 text-gray-300 border border-gray-600'
                                            }`}
                                        >
                                            {comp.sentiment}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-end h-6 gap-0.5">
                                            {comp.trend.map((t, i) => {
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
                                            })}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {loading && mentionsData.length < competitors.length && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500 text-sm">
                                        Loading more competitors...
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CompetitorMentionsList;
