import React, { useState, useEffect } from 'react';

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
}

export const SentimentTracking: React.FC<SentimentTrackingProps> = ({ brandName }) => {
    const [data, setData] = useState<SentimentResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<{ date: string; score: number }[]>([]);

    // 1. Load History on Mount
    useEffect(() => {
        if (!brandName) return;

        const loadHistory = async () => {
            try {
                const historyResp = await fetch(`/api/aeo/sentiment-history/${encodeURIComponent(brandName)}`);
                if (historyResp.ok) {
                    const hData = await historyResp.json();
                    if (hData.success) {
                        setHistory(hData.history);
                        // Hydrate the dashboard with the latest saved run
                        if (hData.latestResult) {
                            setData(hData.latestResult);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to load history", err);
            }
        };

        loadHistory();
    }, [brandName]);

    // 2. Manual Analysis Trigger
    const runAnalysis = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/aeo/sentiment-tracking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brand_name: brandName }),
            });

            if (!response.ok) throw new Error('Failed to fetch sentiment data');

            const result = await response.json();
            setData(result);

            // Refresh history after new run
            const historyResp = await fetch(`/api/aeo/sentiment-history/${encodeURIComponent(brandName)}`);
            if (historyResp.ok) {
                const hData = await historyResp.json();
                if (hData.success) {
                    setHistory(hData.history);
                    // Do not overwrite 'data' here, as we just received fresh data from the analysis
                }
            }

        } catch (err: any) {
            setError(err.message);
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

    // Chart with Area Fill and Gradient
    const renderChart = () => {
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

        // Slice to get only the last 12 runs
        const recentHistory = history.slice(-12);

        const startTime = new Date(recentHistory[0].date).getTime();
        const endTime = new Date(recentHistory[recentHistory.length - 1].date).getTime();
        const timeRange = endTime - startTime || 1;

        // Helper to get coordinates
        const getCoord = (h: { date: string; score: number }) => {
            const time = new Date(h.date).getTime();
            const x = paddingLeft + ((time - startTime) / timeRange) * (width - paddingLeft - paddingRight);
            const y = height - paddingBottom - (h.score / 100) * (height - paddingBottom - paddingTop);
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
                        {points.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r="4" className="fill-blue-900 stroke-blue-400 stroke-2 hover:fill-white cursor-pointer transition-colors">
                                <title>{`Score: ${recentHistory[i].score}`}</title>
                            </circle>
                        ))}


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
                    <span>❤️</span> Sentiment Tracking
                    <span className="text-sm font-normal text-gray-400 ml-2">({brandName})</span>
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
                        {/* LEFT COLUMN: Metrics */}
                        <div className="space-y-6">
                            {/* Score Card */}
                            {data && (
                                <div className="flex items-center gap-4 bg-gray-900/50 p-6 rounded-lg border border-gray-700/50">
                                    <div className="text-center pr-4 border-r border-gray-700">
                                        <div className={`text-4xl font-bold ${getScoreColor(data.overall_score)}`}>{data.overall_score}</div>
                                        <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">Score</div>
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
                            )}

                            {/* Model Breakdown List */}
                            <div>
                                <h5 className="text-sm font-bold text-gray-300 uppercase mb-3 px-1">Model Analysis</h5>
                                <div className="overflow-hidden rounded-lg border border-gray-700/50">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-800/50 border-b border-gray-700/50 font-semibold">
                                            <tr>
                                                <th scope="col" className="px-4 py-3">Model</th>
                                                <th scope="col" className="px-4 py-3 text-right">Pos/Neu/Neg</th>
                                                <th scope="col" className="px-4 py-3 text-right">Score</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700/30">
                                            {data ? Object.entries(data.models).map(([model, info]) => (
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
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan={3} className="px-4 py-3 text-center text-gray-500 italic">No model data available.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Chart */}
                        <div className="flex flex-col h-full min-h-[250px] bg-gray-900/30 p-2 rounded-lg border border-gray-700/50">
                            <h5 className="text-sm font-bold text-gray-300 uppercase mb-2 text-center pt-2">Sentiment Trend</h5>
                            <div className="flex-grow flex items-center justify-center w-full">
                                {renderChart()}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};


export default SentimentTracking;
