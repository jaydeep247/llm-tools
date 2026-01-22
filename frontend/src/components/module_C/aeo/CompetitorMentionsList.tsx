
import React, { useState, useEffect } from 'react';

interface CompetitorMention {
    name: string;
    mentions: number;
    sentiment: string;
    trend: { date: string; count: number }[];
}

interface CompetitorMentionsListProps {
    competitors: string[];
}

const CompetitorMentionsList: React.FC<CompetitorMentionsListProps> = ({ competitors }) => {
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

    return (
        <div className="competitor-mentions-section" style={{ marginTop: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Competitor Mentions (Share of Voice)</span>
                {loading && <span style={{ fontSize: '12px', color: '#666' }}>Processing {processedCount}/{competitors.length}...</span>}
            </h4>

            {error && <div style={{ color: 'red', fontSize: '14px', marginBottom: '10px' }}>Error: {error}</div>}

            <div className="mentions-table-container" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '8px' }}>Competitor</th>
                            <th style={{ padding: '8px' }}>Mentions (12mo)</th>
                            <th style={{ padding: '8px' }}>Sentiment</th>
                            <th style={{ padding: '8px' }}>Trend</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mentionsData.map((comp, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '8px', fontWeight: '500' }}>{comp.name}</td>
                                <td style={{ padding: '8px' }}>{comp.mentions.toLocaleString()}</td>
                                <td style={{ padding: '8px' }}>
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        backgroundColor: comp.sentiment === 'Positive' ? '#d1fae5' :
                                            comp.sentiment === 'Negative' ? '#fee2e2' : '#f3f4f6',
                                        color: comp.sentiment === 'Positive' ? '#065f46' :
                                            comp.sentiment === 'Negative' ? '#991b1b' : '#374151'
                                    }}>
                                        {comp.sentiment}
                                    </span>
                                </td>
                                <td style={{ padding: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'end', height: '24px', gap: '2px' }}>
                                        {comp.trend.map((t, i) => (
                                            <div key={i} style={{
                                                width: '4px',
                                                height: `${Math.max(10, Math.min(100, (t.count / (Math.max(...comp.trend.map(x => x.count)) || 1)) * 100))}%`,
                                                backgroundColor: '#3b82f6',
                                                borderRadius: '1px'
                                            }} title={`${t.date}: ${t.count}`} />
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {loading && mentionsData.length < competitors.length && (
                            <tr>
                                <td colSpan={4} style={{ padding: '10px', textAlign: 'center', color: '#666' }}>
                                    Loading more competitors...
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CompetitorMentionsList;
