
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
    url?: string;
    sessionId?: number | null;
    savedData?: any;
    savedSov?: any;
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
    url,
    sessionId,
    savedData,
    savedSov,
}) => {
    const [mentionsData, setMentionsData] = useState<CompetitorMention[]>([]);
    const [sovData, setSovData] = useState<ShareOfVoiceData | null>(null);
    const [loading, setLoading] = useState(false);
    const [sovLoading, setSovLoading] = useState(false);
    const [processedCount, setProcessedCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [hasRun, setHasRun] = useState(false);
    const [analyzedCompetitorNames, setAnalyzedCompetitorNames] = useState<string[]>([]);

    useEffect(() => {
        // Initialize from saved data if available
        if (savedData && mentionsData.length === 0 && !hasRun) {
            console.log('[CompetitorMentionsList] Initializing from savedData', { dataLength: savedData.length });
            setMentionsData(savedData);
            setProcessedCount(savedData.length);
            setHasRun(true);
        }
        if (savedSov && !sovData && !hasRun) {
            console.log('[CompetitorMentionsList] Initializing from savedSov', { savedSov });
            setSovData(savedSov);
        }
    }, [savedData, savedSov, hasRun, mentionsData.length, sovData]);

    // Debug: Log whenever sovData changes
    useEffect(() => {
        console.log('[CompetitorMentionsList] sovData updated:', { 
            hasSOV: !!sovData, 
            overall: sovData?.overall, 
            by_model_keys: sovData?.by_model ? Object.keys(sovData.by_model) : [],
            fullData: sovData
        });
    }, [sovData]);

    useEffect(() => {
        // Reset when competitors list changes drastically, but not if we just have auto-discovered data
        if (competitors.length > 0 && !hasRun) {
            setMentionsData([]);
            setSovData(null);
            setProcessedCount(0);
            setError(null);
            setHasRun(false);
            setAnalyzedCompetitorNames([]);
        }
    }, [competitors, brandName]);

    const handleRunAnalysis = async () => {
        // Allow run if competitors exist OR if we have a URL for auto-discovery
        if (competitors.length === 0 && !url) {
            setError("No competitors configured and no URL available for auto-discovery.");
            return;
        }

        setLoading(true);
        setSovLoading(brandName ? true : false); // Only show SOV loading if brand_name is provided
        setHasRun(true);
        setProcessedCount(0);
        setError(null);
        setMentionsData([]);
        setSovData(null);
        setAnalyzedCompetitorNames([]);

        try {
            // Single API call: fetch both mentions data AND SOV if brand_name is provided
            const response = await fetch('/api/aeo/analyze-competitors-mentions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    competitors: competitors, // Can be empty
                    ...(brandName && { brand_name: brandName }), // Include brand_name only if available
                    ...(url && { url: url }), // Pass URL for auto-discovery
                    ...(sessionId && { sessionId: sessionId })
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('[CompetitorMentionsList] 📥 RAW API response received:', {
                responseKeys: Object.keys(result),
                success: result.success,
                dataLength: result.data?.length || 0,
                dataType: typeof result.data,
                sovExists: 'share_of_voice' in result,
                sovValue: result.share_of_voice,
                sovType: typeof result.share_of_voice,
                sovIsObject: result.share_of_voice && typeof result.share_of_voice === 'object',
                sovOverall: result.share_of_voice?.overall,
                analyzedCount: result.analyzed_competitors?.length || 0
            });

            if (result.success) {
                // Always set mentionsData, even if empty array
                if (Array.isArray(result.data)) {
                    console.log('[CompetitorMentionsList] ✅ Setting mentionsData:', result.data.length, 'items');
                    setMentionsData(result.data);
                    // Use the returned analyzed competitors count or the requested count
                    const actualCount = result.analyzed_competitors ? result.analyzed_competitors.length : competitors.length;
                    setProcessedCount(actualCount);
                    if (result.analyzed_competitors) {
                        setAnalyzedCompetitorNames(result.analyzed_competitors);
                    }
                }
            } else {
                if (result.error) throw new Error(result.error);
            }

            // ✅ CRITICAL FIX: Only set sovData if it's a valid object with 'overall' property
            console.log('[CompetitorMentionsList] 🔍 Checking share_of_voice validity:', {
                condition1_isObject: result.share_of_voice && typeof result.share_of_voice === 'object',
                condition2_hasOverall: result.share_of_voice?.overall !== undefined,
                condition2_value: result.share_of_voice?.overall,
                fullCondition: (result.share_of_voice && typeof result.share_of_voice === 'object' && result.share_of_voice.overall !== undefined)
            });

            if (result.share_of_voice && typeof result.share_of_voice === 'object' && result.share_of_voice.overall !== undefined) {
                console.log('[CompetitorMentionsList] ✅✅ SETTING sovData from API response:', {
                    overall: result.share_of_voice.overall,
                    by_model_keys: Object.keys(result.share_of_voice.by_model || {}).length,
                    fullSOV: result.share_of_voice
                });
                setSovData(result.share_of_voice);
            } else {
                console.warn('[CompetitorMentionsList] ⚠️⚠️ FAILED to set sovData - conditions not met', {
                    share_of_voice: result.share_of_voice,
                    isTruthy: !!result.share_of_voice,
                    isObject: typeof result.share_of_voice === 'object',
                    hasOverall: result.share_of_voice?.overall !== undefined,
                    overallValue: result.share_of_voice?.overall
                });
            }

        } catch (err: any) {
            console.error("Error fetching competitor mentions:", err);
            setError(err.message);
        } finally {
            setLoading(false);
            setSovLoading(false);
        }
    };

    // ✅ CRITICAL FIX: Only use API's share of voice, never the calculated value during loading
    // This prevents showing 100% when button is clicked with empty data

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

    // Determine effective competitor list for UI state
    const effectiveCompetitorCount = mentionsData.length > 0 ? mentionsData.length : competitors.length;
    const isAutoDiscoveryMode = competitors.length === 0 && url;

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
                            Processing {processedCount > 0 ? processedCount : '...'} competitors...
                        </span>
                    )}
                    {!loading && (
                        <button
                            onClick={handleRunAnalysis}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
                        >
                            {hasRun ? 'Re-run Analysis' : 'Run Analysis'}
                        </button>
                    )}
                </div>
            </div>
            <div className="p-6">
                {effectiveCompetitorCount === 0 && !isAutoDiscoveryMode && (
                    <div className="text-center py-8 bg-gray-900/30 rounded-lg border border-gray-800 border-dashed">
                        <div className="text-3xl mb-2 opacity-30">🚫</div>
                        <p className="text-gray-400">
                            No competitors configured. Please add competitors in the settings to analyze Share of Voice.
                        </p>
                    </div>
                )}

                {(effectiveCompetitorCount > 0 || isAutoDiscoveryMode) && !hasRun && !loading && (
                    <div className="text-center py-12 bg-gray-900/30 rounded-lg border border-gray-800 border-dashed">
                        <div className="text-4xl mb-3 opacity-30">📊</div>
                        <p className="text-gray-400">
                            {competitors.length === 0 ? (
                                <span>No competitors list. Click <span className="text-blue-400 font-medium">Run Analysis</span> to <b>auto-discover</b> competitors and fetch data.</span>
                            ) : (
                                <span>Click <span className="text-blue-400 font-medium">Run Analysis</span> to fetch competitor mentions and share of voice data.</span>
                            )}
                        </p>
                    </div>
                )}

                {(hasRun || loading) && (
                    <>
                        {analyzedCompetitorNames.length > 0 && competitors.length === 0 && (
                            <div className="mb-6 p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg text-sm text-blue-300 flex items-center gap-2">
                                <span>🤖</span>
                                <span>
                                    <strong>Auto-Discovered Competitors:</strong> We found and analyzed {analyzedCompetitorNames.join(', ')}.
                                </span>
                            </div>
                        )}
                        {(() => {
                            // ✅ CRITICAL FIX: Only show SOV if API provided it (sovData is set)
                            // Don't show calculated SOV during loading
                            const sovValue = sovData?.overall;
                            const shouldShow = sovValue !== null && sovValue !== undefined;
                            
                            console.log('[CompetitorMentionsList] 🎯 SOV Rendering Check:', {
                                loading,
                                sovData: sovData ? { overall: sovData.overall, by_model_keys: Object.keys(sovData.by_model || {}).length } : null,
                                sovValue,
                                shouldShow,
                                renderingCondition: {
                                    loadingAndNotShow: loading && !shouldShow,
                                    shouldShowAndDone: !loading && shouldShow
                                }
                            });
                            
                            // Show loading message while waiting for API
                            if (loading && !shouldShow) {
                                console.log('[CompetitorMentionsList] 🔄 Rendering LOADING state');
                                return (
                                    <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                                        <h5 className="text-sm font-bold text-gray-300 uppercase mb-2">Share of Voice (%) - Overall</h5>
                                        <p className="text-xs text-gray-400 mb-2">Calculating share of voice...</p>
                                        <div className="text-3xl font-bold text-gray-500">--</div>
                                    </div>
                                );
                            }
                            
                            return shouldShow ? (() => {
                                console.log('[CompetitorMentionsList] ✅ Rendering SOV display:', { sovValue });
                                return (
                                    <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                                        <h5 className="text-sm font-bold text-gray-300 uppercase mb-2">Share of Voice (%) - Overall</h5>
                                        <p className="text-xs text-gray-400 mb-2">Your brand&apos;s share of total mentions vs. competitors (last 12 months)</p>
                                        <div className={`text-3xl font-bold ${sovValue >= 50 ? 'text-green-400' : sovValue >= 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                                            {sovValue}%
                                        </div>
                                    </div>
                                );
                            })() : null;

                        {sovData && sovData.by_model && Object.keys(sovData.by_model).length > 0 && (
                            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-3 text-white">Share of Voice - Model-wise Breakdown</h5>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {Object.entries(sovData.by_model).map(([model, data]) => {
                                        const modelLabel = {
                                            chatgpt: 'ChatGPT',
                                            claude: 'Claude',
                                            gemini: 'Gemini'
                                        }[model] || model;

                                        return (
                                            <div key={model} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="text-sm font-semibold text-gray-300">{modelLabel}</div>
                                                    <div className={`text-xl font-bold ${data.sov >= 50 ? 'text-green-400' : data.sov >= 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                        {data.sov}%
                                                    </div>
                                                </div>
                                                <div className="space-y-1 mt-3 pt-3 border-t border-gray-700/50 text-[11px]">
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500">Brand:</span>
                                                        <span className="text-gray-300">{data.brand_mentions}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500">Competitors:</span>
                                                        <span className="text-gray-300">{data.competitor_mentions}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {sovTrendData.length >= 2 && (
                            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-2">Share of Voice - Trend Over Time</h5>
                                <div className="h-24 flex items-end gap-0.5">
                                    {sovTrendData.map((d, i) => (
                                        <div
                                            key={i}
                                            className="flex-1 min-w-[4px] bg-blue-600 rounded-sm"
                                            style={{ height: `${Math.max(4, (d.sov / 100) * 80)}px` }}
                                            title={`${d.date.slice(0, 7)}: ${d.sov}%`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {mentionsData.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-700">
                                            <th className="px-4 py-3 text-xs font-bold uppercase text-gray-400">Competitor</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase text-gray-400">Mentions</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase text-gray-400">Sentiment</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase text-gray-400">Trend</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mentionsData.map((comp, idx) => (
                                            <tr key={idx} className="border-b border-gray-800 hover:bg-gray-900/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-white">{comp.name}</td>
                                                <td className="px-4 py-3 text-gray-400">{comp.mentions}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${comp.sentiment === 'Positive' ? 'bg-green-900/40 text-green-400' : comp.sentiment === 'Negative' ? 'bg-red-900/40 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
                                                        {comp.sentiment}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-end h-4 gap-0.5">
                                                        {(comp.trend || []).slice(-12).map((t, i) => {
                                                            const maxCount = Math.max(...comp.trend.map(x => x.count), 1);
                                                            return (
                                                                <div key={i} className="w-1 bg-blue-500 rounded-px" style={{ height: `${(t.count / maxCount) * 16}px` }} />
                                                            );
                                                        })}
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
