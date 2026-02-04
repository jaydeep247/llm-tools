import React, { useState, useEffect } from 'react';
import { useTrackSentimentMutation, useGetSentimentHistoryQuery } from '../../store/api/module_E/sentimentApi';

interface SentimentTrackingProps {
    brandName: string;
}

interface ModelData {
    model: string;
    average_score: number;
    distribution: {
        Positive: number;
        Neutral: number;
        Negative: number;
    };
    details: any[];
}

interface SentimentResult {
    brand_name: string;
    overall_score: number;
    distribution: {
        Positive: number;
        Neutral: number;
        Negative: number;
    };
    models: {
        [key: string]: ModelData;
    };
    visibility?: {
        overall_visibility_score: number;
        models: {
            [key: string]: {
                appearance_rate: number;
                avg_position_weight: number;
                visibility_score: number;
                total_prompts: number;
                appearances: number;
            };
        };
    };
}

const NOT_CONFIGURED = 'not configured';

export const SentimentTracking: React.FC<SentimentTrackingProps> = ({ brandName }) => {
    const normalizedBrand = (brandName || '').trim();
    const isBrandConfigured = normalizedBrand.length > 0 && normalizedBrand.toLowerCase() !== NOT_CONFIGURED;

    if (typeof window !== 'undefined') {
        console.log('[SentimentTracking] brandName:', JSON.stringify(brandName), 'normalizedBrand:', JSON.stringify(normalizedBrand), 'isBrandConfigured:', isBrandConfigured);
    }

    const [data, setData] = useState<SentimentResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<{ date: string; sentimentScore?: number; visibilityScore?: number; score?: number }[]>([]);

    // RTK Query hooks — skip history when brand is not configured
    const [trackSentiment] = useTrackSentimentMutation();
    const { data: historyData, refetch: refetchHistory } = useGetSentimentHistoryQuery(normalizedBrand, {
        skip: !isBrandConfigured,
    });

    // Load history when data changes
    useEffect(() => {
        if (historyData?.success) {
            setHistory(historyData.history || []);
            // Hydrate the dashboard with the latest saved run
            if (historyData.latestResult) {
                setData(historyData.latestResult);
            }
        }
    }, [historyData]);

    // Manual Analysis Trigger — do not call API when brand is not configured
    const runAnalysis = async () => {
        if (typeof window !== 'undefined') {
            console.log('[SentimentTracking] runAnalysis called with brandName:', JSON.stringify(brandName));
        }
        if (!isBrandConfigured) {
            setError('Brand name is not configured. Please set a valid brand (e.g. from Analysis Summary or competitor) before running analysis.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const result = await trackSentiment({ brand_name: normalizedBrand }).unwrap();
            if (typeof window !== 'undefined') {
                console.log('[SentimentTracking] trackSentiment success:', result);
            }
            setData(result.data || result);
            await refetchHistory();
        } catch (err: any) {
            if (typeof window !== 'undefined') {
                console.log('[SentimentTracking] trackSentiment error:', err);
            }
            setError(err?.data?.error || err?.message || 'Failed to fetch sentiment data');
        } finally {
            setLoading(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-500';
        if (score >= 60) return 'text-yellow-500';
        return 'text-red-500';
    };

    const getBarWidth = (count: number, total: number) => {
        if (total === 0) return '0%';
        return `${(count / total) * 100}%`;
    };

    // --- Visibility Over Time: growth/decline % and time-based changes ---
    const visibilityGrowthDecline = (() => {
        if (history.length < 2) return null;
        const current = history[history.length - 1].visibilityScore ?? history[history.length - 1].score ?? 0;
        const previous = history[history.length - 2].visibilityScore ?? history[history.length - 2].score ?? 0;
        if (previous <= 0) return null;
        return Math.round(((current - previous) / previous) * 100);
    })();

    const timeBasedChanges = (() => {
        if (history.length < 2) return null;
        const current = history[history.length - 1];
        const previous = history[history.length - 2];
        const currVis = current.visibilityScore ?? current.score ?? 0;
        const prevVis = previous.visibilityScore ?? previous.score ?? 0;
        const currSent = current.sentimentScore ?? current.score ?? 0;
        const prevSent = previous.sentimentScore ?? previous.score ?? 0;

        const visibilityDelta = currVis - prevVis;
        const sentimentDelta = currSent - prevSent;
        const visibilityPct = prevVis > 0 ? Math.round(((currVis - prevVis) / prevVis) * 100) : null;
        const sentimentPct = prevSent > 0 ? Math.round(((currSent - prevSent) / prevSent) * 100) : null;

        return {
            visibility: { current: currVis, previous: prevVis, delta: visibilityDelta, pct: visibilityPct },
            sentiment: { current: currSent, previous: prevSent, delta: sentimentDelta, pct: sentimentPct },
        };
    })();

    // Chart with Area Fill and Gradient
    const renderChart = () => {
        if (history.length < 2) {
            return (
                <div className="mt-6 p-4 bg-gray-900/30 rounded border border-gray-800 border-dashed text-center">
                    <h3 className="text-sm text-gray-400 mb-2">Visibility Trend</h3>
                    <p className="text-xs text-gray-500">
                        {history.length === 1 ? "1 analysis saved. Run again to see a trend line." : "No history yet. Run an analysis to track visibility over time."}
                    </p>
                </div>
            );
        }

        const height = 150;
        const width = 600;
        const paddingLeft = 30;
        const paddingRight = 20;
        const paddingBottom = 25;
        const paddingTop = 20;

        // Slice to get only the last 12 runs
        const recentHistory = history.slice(-12);

        const startTime = new Date(recentHistory[0].date).getTime();
        const endTime = new Date(recentHistory[recentHistory.length - 1].date).getTime();
        const timeRange = endTime - startTime || 1;

        // Helper to get coordinates
        const getCoord = (h: { date: string; sentimentScore?: number; visibilityScore?: number; score?: number }) => {
            const time = new Date((h as any).date).getTime();
            const value = (h.visibilityScore ?? h.score ?? 0);
            const x = paddingLeft + ((time - startTime) / timeRange) * (width - paddingLeft - paddingRight);
            const y = height - paddingBottom - (value / 100) * (height - paddingBottom - paddingTop);
            return { x, y };
        };

        const points = recentHistory.map(getCoord);

        // Generate Path Command (Line)
        const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");

        // Generate Area Path (Line + close loop at bottom)
        const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-2">
                <div className="w-full overflow-hidden relative" style={{ height: '100%' }}>
                    {/* Y-Axis Labels */}
                    <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-gray-500 font-mono pointer-events-none" style={{ height: `${height}px`, paddingBottom: `${paddingBottom}px`, paddingTop: `${paddingTop}px` }}>
                        <span>100</span>
                        <span>50</span>
                        <span>0</span>
                    </div>

                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 ml-2" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.5" />
                                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        {/* Grid lines */}
                        <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} className="stroke-gray-800 stroke-[0.5] stroke-dashed" />
                        <line x1={paddingLeft} y1={(height - paddingBottom - paddingTop) / 2 + paddingTop} x2={width - paddingRight} y2={(height - paddingBottom - paddingTop) / 2 + paddingTop} className="stroke-gray-800 stroke-[0.5] stroke-dashed" />
                        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} className="stroke-gray-700 stroke-[1]" />

                        {/* Area Fill */}
                        <path d={areaPath} fill="url(#chartGradient)" className="stroke-none" />

                        {/* Trend Line */}
                        <path d={linePath} className="stroke-blue-500 stroke-[2] fill-none drop-shadow-md" />

                        {/* Dots */}
                        {points.map((p, i) => {
                            const entry = recentHistory[i] as any;
                            const value = entry.visibilityScore ?? entry.score ?? 0;
                            return (
                            <circle key={i} cx={p.x} cy={p.y} r="4" className="fill-blue-900 stroke-blue-400 stroke-2 hover:fill-white cursor-pointer transition-colors">
                                <title>{`Visibility: ${value}`}</title>
                            </circle>
                        );
                        })}


                    </svg>
                </div>
            </div>
        );
    };

    // Sentiment trend chart (uses sentimentScore from history)
    const renderSentimentChart = () => {
        if (history.length < 2) {
            return (
                <div className="mt-6 p-4 bg-gray-900/30 rounded border border-gray-800 border-dashed text-center">
                    <h3 className="text-sm text-gray-400 mb-2">Sentiment Trend</h3>
                    <p className="text-xs text-gray-500">
                        {history.length === 1 ? "1 analysis saved. Run again to see a trend line." : "No history yet. Run an analysis to track sentiment over time."}
                    </p>
                </div>
            );
        }

        const height = 150;
        const width = 600;
        const paddingLeft = 30;
        const paddingRight = 20;
        const paddingBottom = 25;
        const paddingTop = 20;

        const recentHistory = history.slice(-12);

        const startTime = new Date((recentHistory[0] as any).date).getTime();
        const endTime = new Date((recentHistory[recentHistory.length - 1] as any).date).getTime();
        const timeRange = endTime - startTime || 1;

        const getCoord = (h: { date: string; sentimentScore?: number; visibilityScore?: number; score?: number }) => {
            const time = new Date((h as any).date).getTime();
            const value = (h.sentimentScore ?? h.score ?? 0);
            const x = paddingLeft + ((time - startTime) / timeRange) * (width - paddingLeft - paddingRight);
            const y = height - paddingBottom - (value / 100) * (height - paddingBottom - paddingTop);
            return { x, y };
        };

        const points = recentHistory.map(getCoord);

        const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
        const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-2">
                <div className="w-full overflow-hidden relative" style={{ height: '100%' }}>
                    <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-gray-500 font-mono pointer-events-none" style={{ height: `${height}px`, paddingBottom: `${paddingBottom}px`, paddingTop: `${paddingTop}px` }}>
                        <span>100</span>
                        <span>50</span>
                        <span>0</span>
                    </div>

                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 ml-2" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="sentimentChartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.5" />
                                <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} className="stroke-gray-800 stroke-[0.5] stroke-dashed" />
                        <line x1={paddingLeft} y1={(height - paddingBottom - paddingTop) / 2 + paddingTop} x2={width - paddingRight} y2={(height - paddingBottom - paddingTop) / 2 + paddingTop} className="stroke-gray-800 stroke-[0.5] stroke-dashed" />
                        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} className="stroke-gray-700 stroke-[1]" />

                        <path d={areaPath} fill="url(#sentimentChartGradient)" className="stroke-none" />
                        <path d={linePath} className="stroke-yellow-400 stroke-[2] fill-none drop-shadow-md" />

                        {points.map((p, i) => {
                            const entry = recentHistory[i] as any;
                            const value = entry.sentimentScore ?? entry.score ?? 0;
                            return (
                                <circle key={i} cx={p.x} cy={p.y} r="4" className="fill-yellow-900 stroke-yellow-400 stroke-2 hover:fill-white cursor-pointer transition-colors">
                                    <title>{`Sentiment: ${value}`}</title>
                                </circle>
                            );
                        })}
                    </svg>
                </div>
            </div>
        );
    };

    // Helper for sentiment label
    const getSentimentLabel = (distribution: { Positive: number, Neutral: number, Negative: number }) => {
        const total = distribution.Positive + distribution.Neutral + distribution.Negative;
        if (total === 0) return "No Data";
        const posPct = distribution.Positive / total;
        const negPct = distribution.Negative / total;

        if (posPct > 0.6) return "Positive Strong";
        if (posPct > 0.4) return "Positive Leaning";
        if (negPct > 0.4) return "Negative Leaning";
        return "Neutral / Mixed";
    };

    // Brand not configured: show clear error and do not render charts/API UI
    if (!isBrandConfigured) {
        return (
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <div className="bg-yellow-900/40 border border-yellow-600 rounded-lg p-4 mb-3">
                    <p className="text-yellow-200 font-semibold">Brand is Not Configured</p>
                    <p className="text-yellow-100/90 text-sm mt-1">
                        Set a valid brand name (e.g. from Analysis Summary or competitor) to run sentiment and visibility analysis.
                    </p>
                    <p className="text-gray-400 text-xs mt-2 font-mono">Current value: {brandName === '' ? '(empty)' : JSON.stringify(brandName)}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 text-center">
                <p className="text-red-400 font-semibold">Validation Failed</p>
                <p className="text-gray-400 text-sm mt-1">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white"
                >
                    Retry Analysis
                </button>
            </div>
        );
    }

    // Default View (History Only or With Data)
    return (
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <h4 className="text-xl font-bold text-gray-200 flex items-center gap-2">
                    <span>❤️</span> Sentiment & Visibility Tracking
                    <span className="text-sm font-normal text-gray-400 ml-2">({normalizedBrand})</span>
                </h4>
                {!loading && (
                    <button
                        onClick={runAnalysis}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow transition-colors"
                    >
                        Run Analysis
                    </button>
                )}
            </div>

            {
                loading ? (
                    <div className="mb-6 animate-pulse">
                        <div className="h-4 bg-gray-700 rounded w-full mb-2"></div>
                        <div className="h-4 bg-gray-700 rounded w-2/3"></div>
                        <p className="text-center text-xs text-gray-400 mt-2">Consulting OpenAI, Gemini, and Claude...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* LEFT COLUMN: Sentiment only */}
                        <div className="space-y-6">
                            {data && (
                                <div className="flex flex-col gap-4 bg-gray-900/50 p-6 rounded-lg border border-gray-700/50">
                                    <h5 className="text-sm font-bold text-gray-300 uppercase mb-1">Sentiment Overview</h5>
                                    <div className="flex items-center gap-4">
                                        <div className="text-center pr-4 border-r border-gray-700">
                                            <div className={`text-4xl font-bold ${getScoreColor(data.overall_score)}`}>{data.overall_score}</div>
                                            <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">Sentiment Score</div>
                                        </div>
                                        <div className="flex-grow pl-2">
                                            <div className="text-sm text-gray-300 mb-2 flex justify-between">
                                                <span>Sentiment:</span>
                                                <span className={`font-bold ${data.overall_score >= 60 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                    {getSentimentLabel(data.distribution)}
                                                </span>
                                            </div>
                                            <div className="flex h-3 rounded-full overflow-hidden bg-gray-700 w-full shadow-inner">
                                                <div style={{ width: getBarWidth(data.distribution.Positive, (data.distribution.Positive + data.distribution.Neutral + data.distribution.Negative)) }} className="bg-green-500 h-full" title={`Positive: ${data.distribution.Positive}`} />
                                                <div style={{ width: getBarWidth(data.distribution.Neutral, (data.distribution.Positive + data.distribution.Neutral + data.distribution.Negative)) }} className="bg-yellow-500 h-full" title={`Neutral: ${data.distribution.Neutral}`} />
                                                <div style={{ width: getBarWidth(data.distribution.Negative, (data.distribution.Positive + data.distribution.Neutral + data.distribution.Negative)) }} className="bg-red-500 h-full" title={`Negative: ${data.distribution.Negative}`} />
                                            </div>
                                            <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                                                <span>Pos</span>
                                                <span>Neu</span>
                                                <span>Neg</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Sentiment Trend */}
                            <div className="flex flex-col h-full min-h-[200px] bg-gray-900/30 p-2 rounded-lg border border-gray-700/50">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-2 text-center pt-2">Sentiment Trend</h5>
                                <div className="flex-grow flex items-center justify-center w-full">
                                    {renderSentimentChart()}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: All visibility metrics */}
                        <div className="flex flex-col h-full space-y-4">
                            {data?.visibility && (
                                <div className="flex items-center justify-between bg-gray-900/50 p-6 rounded-lg border border-gray-700/50">
                                    <div>
                                        <h5 className="text-sm font-bold text-gray-300 uppercase mb-1">Visibility Overview</h5>
                                        <p className="text-xs text-gray-400">
                                            How often and how prominently your brand appears across AI models.
                                        </p>
                                    </div>
                                    <div className={`text-3xl font-bold ${getScoreColor(data.visibility.overall_visibility_score)}`}>
                                        {data.visibility.overall_visibility_score}
                                    </div>
                                </div>
                            )}

                            {/* Visibility Over Time submodule: [1] Trend graphs, [2] Growth %, [3] Time-based changes */}
                            <div className="pt-2 pb-1">
                                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Visibility Over Time</h5>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-1">Visibility Growth or Decline (%)</h5>
                                <p className="text-xs text-gray-400 mb-2">Percentage change in visibility score vs. last run</p>
                                {visibilityGrowthDecline != null ? (
                                    <div className="flex items-center gap-2">
                                        <span className={`text-2xl font-bold ${visibilityGrowthDecline >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {visibilityGrowthDecline >= 0 ? '+' : ''}{visibilityGrowthDecline}%
                                        </span>
                                        <span className="text-xs text-gray-500">vs last run</span>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">Run analysis again to compare with previous run</p>
                                )}
                            </div>

                            {/* Time-based Performance Changes */}
                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-1">Time-based Performance Changes</h5>
                                <p className="text-xs text-gray-400 mb-3">Comparison vs. last run</p>
                                {timeBasedChanges ? (
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400">Visibility</span>
                                            <span>
                                                <span className="font-medium text-white">{timeBasedChanges.visibility.current}</span>
                                                <span className="text-gray-500 text-xs mx-1">(was {timeBasedChanges.visibility.previous})</span>
                                                <span className={timeBasedChanges.visibility.delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                    {timeBasedChanges.visibility.delta >= 0 ? '+' : ''}{timeBasedChanges.visibility.delta} pts
                                                    {timeBasedChanges.visibility.pct != null && (
                                                        <span className="ml-1">
                                                            ({timeBasedChanges.visibility.pct >= 0 ? '+' : ''}{timeBasedChanges.visibility.pct}%)
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400">Sentiment</span>
                                            <span>
                                                <span className="font-medium text-white">{timeBasedChanges.sentiment.current}</span>
                                                <span className="text-gray-500 text-xs mx-1">(was {timeBasedChanges.sentiment.previous})</span>
                                                <span className={timeBasedChanges.sentiment.delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                    {timeBasedChanges.sentiment.delta >= 0 ? '+' : ''}{timeBasedChanges.sentiment.delta} pts
                                                    {timeBasedChanges.sentiment.pct != null && (
                                                        <span className="ml-1">
                                                            ({timeBasedChanges.sentiment.pct >= 0 ? '+' : ''}{timeBasedChanges.sentiment.pct}%)
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">Run analysis again to see performance changes</p>
                                )}
                            </div>

                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 flex-1">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-3 px-1">Model-wise Breakdown (ChatGPT, Claude, Gemini)</h5>
                                <div className="overflow-hidden rounded-lg border border-gray-700/50">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-800/50 border-b border-gray-700/50 font-semibold">
                                            <tr>
                                                <th scope="col" className="px-4 py-3">Model</th>
                                                <th scope="col" className="px-4 py-3 text-right">Pos/Neu/Neg</th>
                                                <th scope="col" className="px-4 py-3 text-right">Sentiment</th>
                                                <th scope="col" className="px-4 py-3 text-right">Visibility</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700/30">
                                            {data ? Object.entries(data.models).map(([model, info]) => {
                                                const visibilityForModel = data.visibility?.models?.[model];
                                                return (
                                                    <tr key={model} className="bg-gray-750/30 hover:bg-gray-700/50 transition-colors">
                                                        <td className="px-4 py-3 font-medium text-gray-300 capitalize">
                                                            {model}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-xs">
                                                            <span className="text-green-500">{info.distribution.Positive}</span>
                                                            <span className="text-gray-600 mx-1">/</span>
                                                            <span className="text-yellow-500">{info.distribution.Neutral}</span>
                                                            <span className="text-gray-600 mx-1">/</span>
                                                            <span className="text-red-500">{info.distribution.Negative}</span>
                                                        </td>
                                                        <td className={`px-4 py-3 text-right font-bold ${getScoreColor(info.average_score)}`}>
                                                            {info.average_score}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-xs">
                                                            {visibilityForModel ? (
                                                                <div className="flex flex-col items-end">
                                                                    <span className={`font-bold ${getScoreColor(visibilityForModel.visibility_score)}`}>
                                                                        {visibilityForModel.visibility_score}
                                                                    </span>
                                                                    <span className="text-[10px] text-gray-500">
                                                                        {(visibilityForModel.appearance_rate * 100).toFixed(0)}% appear •{" "}
                                                                        {visibilityForModel.avg_position_weight.toFixed(2)} pos-wt
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-500 text-xs">N/A</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            }) : (
                                                <tr>
                                                    <td colSpan={3} className="px-4 py-3 text-center text-gray-500 italic">No model data available.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex flex-col h-full min-h-[200px] bg-gray-900/30 p-2 rounded-lg border border-gray-700/50">
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-2 text-center pt-2">Visibility Trend</h5>
                                <div className="flex-grow flex items-center justify-center w-full">
                                    {renderChart()}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};


export default SentimentTracking;
