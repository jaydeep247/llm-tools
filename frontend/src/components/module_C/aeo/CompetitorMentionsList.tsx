
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
    // Track API call timestamp to prevent race conditions
    const [lastApiCallTime, setLastApiCallTime] = useState<number>(0);
    const [initializedFromSaved, setInitializedFromSaved] = useState(false);

    // ✅ SAFE INITIALIZATION: Only on component mount, never reinitialize if user has already run analysis
    useEffect(() => {
        console.log('[CompetitorMentionsList] Mount effect (runs once)', { 
            savedDataLength: savedData?.length || 0,
            hasSavedSov: !!savedSov,
            initializedFromSaved
        });
        
        // Only initialize from saved data once at mount AND only if user hasn't manually run analysis yet
        if (!initializedFromSaved && !hasRun) {
            if (savedData && Array.isArray(savedData) && savedData.length > 0) {
                console.log('[CompetitorMentionsList] ✅ Initializing mentionsData from savedData at mount:', { dataLength: savedData.length });
                setMentionsData(savedData);
                setProcessedCount(savedData.length);
                setHasRun(true);
            }
            if (savedSov && typeof savedSov === 'object' && savedSov.overall !== undefined) {
                console.log('[CompetitorMentionsList] ✅ Initializing sovData from savedSov at mount:', { overall: savedSov.overall });
                setSovData(savedSov);
            }
            setInitializedFromSaved(true);
        }
    }, []); // Empty dependency array - run ONLY ONCE on mount

    // Debug: Log whenever sovData changes
    useEffect(() => {
        console.log('[CompetitorMentionsList] 📊 sovData changed:', { 
            hasSOV: !!sovData, 
            overall: sovData?.overall, 
            by_model_keys: sovData?.by_model ? Object.keys(sovData.by_model) : [],
            fullData: sovData
        });
    }, [sovData]);

    // Reset when URL/brand/competitors significantly change (but not for user-initiated analysis)
    useEffect(() => {
        // Only reset if we haven't initialized from saved data yet AND the user hasn't manually run analysis
        if (!initializedFromSaved && competitors.length > 0 && !hasRun) {
            console.log('[CompetitorMentionsList] 🔄 Resetting state due to prop change:', { competitors: competitors.length, brandName });
            setMentionsData([]);
            setSovData(null);
            setProcessedCount(0);
            setError(null);
            setAnalyzedCompetitorNames([]);
        }
    }, [competitors, brandName, initializedFromSaved]);

    // ✅ DYNAMIC DATA LOADING: If savedData becomes available after mount (e.g., parent refetches), load it
    // This fixes the issue where data doesn't appear when returning to Module E tab
    useEffect(() => {
        // Condition: savedData is available AND we haven't run analysis manually AND we haven't already initialized
        if (
            savedData && 
            Array.isArray(savedData) && 
            savedData.length > 0 && 
            !hasRun && 
            mentionsData.length === 0  // No data currently displayed
        ) {
            console.log('[CompetitorMentionsList] 📥 DYNAMIC LOAD: Loading savedData from props (likely parent refetch):', { dataLength: savedData.length });
            setMentionsData(savedData);
            setProcessedCount(savedData.length);
            setHasRun(true);
        }

        // If savedSov becomes available
        if (
            savedSov && 
            typeof savedSov === 'object' && 
            savedSov.overall !== undefined && 
            !sovData  // No SOV data currently displayed
        ) {
            console.log('[CompetitorMentionsList] 📥 DYNAMIC LOAD: Loading savedSov from props:', { overall: savedSov.overall });
            setSovData(savedSov);
        }
    }, [savedData, savedSov, hasRun, mentionsData.length, sovData]);

    const handleRunAnalysis = async () => {
        // Allow run if competitors exist OR if we have a URL for auto-discovery
        if (competitors.length === 0 && !url) {
            setError("No competitors configured and no URL available for auto-discovery.");
            return;
        }

        // Generate timestamp to track this API call
        const callTime = Date.now();
        setLastApiCallTime(callTime);

        console.log('[CompetitorMentionsList] 🚀 STARTING ANALYSIS:', {
            timestamp: callTime,
            competitors: competitors.length,
            brandName: brandName,
            url: url,
            sessionId: sessionId
        });

        setLoading(true);
        setSovLoading(brandName ? true : false);
        setHasRun(true);
        setProcessedCount(0);
        setError(null);
        setMentionsData([]);
        setSovData(null);
        setAnalyzedCompetitorNames([]);

        try {
            const requestPayload = {
                competitors: competitors,
                ...(brandName && { brand_name: brandName }),
                ...(url && { url: url }),
                ...(sessionId && { sessionId: sessionId })
            };

            console.log('[CompetitorMentionsList] 📤 API Request:', requestPayload);

            const response = await fetch('/api/aeo/analyze-competitors-mentions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload)
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const result = await response.json();

            // ⚠️ IMPORTANT: Only process this response if it's the latest API call
            if (callTime < lastApiCallTime) {
                console.warn('[CompetitorMentionsList] ⚠️ Ignoring response from outdated API call', { 
                    callTime, 
                    lastApiCallTime,
                    message: 'A newer API call was made' 
                });
                return;
            }

            console.log('[CompetitorMentionsList] 📥 RAW API RESPONSE RECEIVED:', {
                timestamp: callTime,
                success: result.success,
                dataLength: result.data?.length || 0,
                dataArray: Array.isArray(result.data),
                hasShareOfVoice: 'share_of_voice' in result,
                shareOfVoiceValue: result.share_of_voice,
                shareOfVoiceType: typeof result.share_of_voice,
                analyzedCompetitors: result.analyzed_competitors || [],
                allKeys: Object.keys(result)
            });

            if (result.success) {
                // Set mentions data (can be empty array)
                if (Array.isArray(result.data)) {
                    console.log('[CompetitorMentionsList] ✅ SETTING mentionsData from API:', {
                        itemCount: result.data.length,
                        items: result.data.map(d => ({ name: d.name, mentions: d.mentions }))
                    });
                    setMentionsData(result.data);
                    
                    const actualCount = result.analyzed_competitors ? result.analyzed_competitors.length : competitors.length;
                    setProcessedCount(actualCount);
                    
                    if (result.analyzed_competitors && Array.isArray(result.analyzed_competitors)) {
                        console.log('[CompetitorMentionsList] ✅ SETTING analyzedCompetitorNames:', result.analyzed_competitors);
                        setAnalyzedCompetitorNames(result.analyzed_competitors);
                    }
                } else {
                    console.warn('[CompetitorMentionsList] ⚠️ result.data is not an array:', typeof result.data);
                }
            } else {
                throw new Error(result.error || 'Analysis failed');
            }

            // Set SOV data with comprehensive validation
            console.log('[CompetitorMentionsList] 🔍 VALIDATING share_of_voice:', {
                exists: !!result.share_of_voice,
                isObject: typeof result.share_of_voice === 'object',
                hasOverallProperty: result.share_of_voice?.overall !== undefined,
                overallValue: result.share_of_voice?.overall,
                overallType: typeof result.share_of_voice?.overall,
                by_modelKeys: result.share_of_voice?.by_model ? Object.keys(result.share_of_voice.by_model).length : 0,
                fullObject: JSON.stringify(result.share_of_voice).substring(0, 200)
            });

            if (result.share_of_voice && typeof result.share_of_voice === 'object') {
                console.log('[CompetitorMentionsList] ✅ SETTING sovData from API:', {
                    overall: result.share_of_voice.overall,
                    hasModels: !!result.share_of_voice.by_model,
                    modelCount: Object.keys(result.share_of_voice.by_model || {}).length,
                    fullData: result.share_of_voice
                });
                setSovData(result.share_of_voice);
            } else {
                console.warn('[CompetitorMentionsList] ⚠️ share_of_voice validation FAILED:', {
                    received: result.share_of_voice,
                    expectedType: 'object'
                });
            }

        } catch (err: any) {
            console.error('[CompetitorMentionsList] ❌ ERROR during analysis:', {
                message: err.message,
                stack: err.stack
            });
            setError(err.message || 'Failed to analyze competitors');
            setMentionsData([]);
            setSovData(null);
        } finally {
            console.log('[CompetitorMentionsList] ✅ ANALYSIS COMPLETE (finally block):', {
                timestamp: callTime,
                hasData: mentionsData.length > 0,
                hasSov: !!sovData
            });
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

                        })()}

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

                        {/* ONLY show trend chart AFTER API call completes AND we have SOV data AND enough trend points */}
                        {!loading && sovData && sovTrendData.length >= 2 && (
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
                                                            const maxCount = Math.max(...(comp.trend || []).map(x => x.count), 1);
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
