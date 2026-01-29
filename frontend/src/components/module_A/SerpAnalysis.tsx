import React, { useState } from 'react';
import { useAnalyzeSerpMutation, useGetSerpHistoryQuery } from '../../store/api/module_A/serpApi';

interface SerpAnalysisProps {
  initialSessionId: number | null;
}

const SerpAnalysis: React.FC<SerpAnalysisProps> = ({ initialSessionId }) => {
  const [keyword, setKeyword] = useState('');
  const [targetDomain, setTargetDomain] = useState('');
  const [location, setLocation] = useState('United States');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  const [analyzeSerp, { data: latestSnapshot, isLoading, error }] = useAnalyzeSerpMutation();

  const normalizedDomain = targetDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');

  const { data: historyData } = useGetSerpHistoryQuery(
    latestSnapshot && normalizedDomain && keyword
      ? {
          keyword,
          domain: normalizedDomain,
          location,
          device,
          limit: 50,
        }
      : // Skip until we have a first snapshot
        {
          keyword: '',
          domain: '',
        } as any,
    {
      skip: !latestSnapshot || !normalizedDomain || !keyword,
    },
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !targetDomain.trim() || !location.trim()) return;

    await analyzeSerp({
      keyword: keyword.trim(),
      target_domain: targetDomain.trim(),
      location: location.trim(),
      device,
      max_results: 100,
      sessionId: initialSessionId ?? undefined,
    }).unwrap();
  };

  const renderChangeBadge = () => {
    if (!latestSnapshot) return null;
    if (latestSnapshot.changeLabel === 'New') {
      return <span style={{ color: '#10b981' }}>New</span>;
    }
    if (latestSnapshot.changeLabel === 'Lost') {
      return <span style={{ color: '#ef4444' }}>Lost</span>;
    }
    if (typeof latestSnapshot.change === 'number') {
      const v = latestSnapshot.change;
      const color = v > 0 ? '#10b981' : v < 0 ? '#ef4444' : '#9ca3af';
      const sign = v > 0 ? '+' : '';
      return <span style={{ color }}>{sign}{v}</span>;
    }
    return <span style={{ color: '#9ca3af' }}>–</span>;
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 30px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.3)', flexShrink: 0 }}>
        <h2 style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.5rem' }}>
          <span>🔍</span> SERP Analysis
        </h2>
        <p style={{ color: '#9ca3af', marginTop: 8, fontSize: 13 }}>
          Check where your domain ranks for a keyword, understand competitors and intent, and track changes over time.
        </p>
      </div>

      {/* Controls */}
      <form
        onSubmit={onSubmit}
        style={{
          padding: '16px 30px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(0, 0, 0, 0.3)',
          display: 'grid',
          gridTemplateColumns: 'minmax(160px, 2fr) minmax(160px, 2fr) minmax(140px, 1.5fr) minmax(100px, 1fr) auto',
          gap: 12,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          placeholder="Keyword (e.g. seo audit tool)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            fontSize: 14,
          }}
        />
        <input
          type="text"
          placeholder="Target domain (e.g. example.com)"
          value={targetDomain}
          onChange={(e) => setTargetDomain(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            fontSize: 14,
          }}
        />
        <input
          type="text"
          placeholder="Location (e.g. United States, London, UK)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            fontSize: 14,
          }}
        />
        <select
          value={device}
          onChange={(e) => setDevice(e.target.value as 'desktop' | 'mobile')}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            fontSize: 14,
          }}
        >
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
        </select>
        <button
          type="submit"
          disabled={isLoading || !keyword.trim() || !targetDomain.trim() || !location.trim()}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: isLoading ? 'rgba(107, 114, 128, 0.5)' : '#6366f1',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {isLoading ? 'Analyzing…' : 'Run SERP Analysis'}
        </button>
      </form>

      {/* Error */}
      {error && 'data' in error && (error as any).data && (
        <div
          style={{
            padding: '10px 30px',
            background: 'rgba(239, 68, 68, 0.15)',
            borderBottom: '1px solid rgba(248, 113, 113, 0.4)',
            color: '#fecaca',
            fontSize: 13,
          }}
        >
          {(error as any).data?.error || 'Failed to analyze SERP'}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'rgba(0, 0, 0, 0.2)', minHeight: 0 }}>
        {/* Left: summary + history */}
        <div
          style={{
            width: 360,
            minWidth: 320,
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            padding: '18px 20px',
            gap: 16,
            overflowY: 'auto',
          }}
        >
          <div style={{ color: '#9ca3af', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Current Snapshot
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(96, 165, 250, 0.4)',
              }}
            >
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Position</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f9fafb' }}>
                {latestSnapshot
                  ? latestSnapshot.position != null
                    ? `#${latestSnapshot.position}`
                    : 'Not ranked'
                  : '—'}
              </div>
            </div>
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(45, 212, 191, 0.4)',
              }}
            >
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Change</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {renderChangeBadge()}
              </div>
            </div>
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(244, 114, 182, 0.4)',
              }}
            >
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Intent</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>
                {latestSnapshot ? latestSnapshot.intent : '—'}
              </div>
            </div>
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(129, 140, 248, 0.4)',
              }}
            >
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Features</div>
              {latestSnapshot ? (
                <div style={{ fontSize: 11, color: '#e5e7eb', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {latestSnapshot.serpFeatures.featured_snippet && <span>⭐ Featured Snippet</span>}
                  {latestSnapshot.serpFeatures.paa && <span>❓ PAA</span>}
                  {latestSnapshot.serpFeatures.video && <span>🎥 Video</span>}
                  {latestSnapshot.serpFeatures.images && <span>🖼 Images</span>}
                  {!latestSnapshot.serpFeatures.featured_snippet &&
                    !latestSnapshot.serpFeatures.paa &&
                    !latestSnapshot.serpFeatures.video &&
                    !latestSnapshot.serpFeatures.images && <span>Standard organic</span>}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#6b7280' }}>—</div>
              )}
            </div>
          </div>

          {/* Top competitors */}
          <div>
            <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Top Competitors (Top 10)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {latestSnapshot && latestSnapshot.topCompetitors.length > 0 ? (
                latestSnapshot.topCompetitors.map((c) => (
                  <div
                    key={c.domain}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 8px',
                      borderRadius: 6,
                      background:
                        normalizeDomain(c.domain) === normalizedDomain
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'rgba(15, 23, 42, 0.7)',
                      border:
                        normalizeDomain(c.domain) === normalizedDomain
                          ? '1px solid rgba(34, 197, 94, 0.6)'
                          : '1px solid rgba(55, 65, 81, 0.7)',
                      fontSize: 12,
                      color: '#e5e7eb',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>
                      {c.domain}
                    </span>
                    <span style={{ color: '#a5b4fc' }}>{c.count} result{c.count !== 1 ? 's' : ''}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: '#6b7280' }}>Run an analysis to see competing domains.</div>
              )}
            </div>
          </div>

          {/* History */}
          <div>
            <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              History
            </div>
            <div style={{ fontSize: 11, color: '#d1d5db', maxHeight: 220, overflowY: 'auto' }}>
              {historyData && historyData.items && historyData.items.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', paddingBottom: 4, borderBottom: '1px solid rgba(55,65,81,0.8)' }}>Date</th>
                      <th style={{ textAlign: 'left', paddingBottom: 4, borderBottom: '1px solid rgba(55,65,81,0.8)' }}>Pos</th>
                      <th style={{ textAlign: 'left', paddingBottom: 4, borderBottom: '1px solid rgba(55,65,81,0.8)' }}>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.items.map((snap) => (
                      <tr key={`${snap.runAt}-${snap.position ?? 'nr'}`}>
                        <td style={{ padding: '4px 0', color: '#9ca3af' }}>
                          {new Date(snap.runAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '4px 0' }}>
                          {snap.position != null ? `#${snap.position}` : 'NR'}
                        </td>
                        <td style={{ padding: '4px 0' }}>
                          {snap.changeLabel === 'New' || snap.changeLabel === 'Lost'
                            ? snap.changeLabel
                            : typeof snap.change === 'number'
                              ? (snap.change > 0 ? `+${snap.change}` : snap.change.toString())
                              : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: '#6b7280' }}>History will appear after multiple runs for the same keyword + domain.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right: SERP table */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(31, 41, 55, 0.9)', background: 'rgba(15, 23, 42, 0.9)', flexShrink: 0 }}>
            <div style={{ color: '#e5e7eb', fontSize: 13 }}>
              {latestSnapshot
                ? `Google ${latestSnapshot.device} • ${latestSnapshot.location} • ${latestSnapshot.searchEngine}`
                : 'Run an analysis to see SERP results.'}
            </div>
            {latestSnapshot && latestSnapshot.rankingUrl && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af' }}>
                Ranking URL:{' '}
                <a
                  href={latestSnapshot.rankingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#93c5fd', textDecoration: 'none' }}
                >
                  {latestSnapshot.rankingUrl}
                </a>
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {latestSnapshot && latestSnapshot.serp.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.9)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid rgba(31,41,55,0.9)', width: 60 }}>Pos</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid rgba(31,41,55,0.9)' }}>Title & URL</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid rgba(31,41,55,0.9)', width: 90 }}>Domain</th>
                  </tr>
                </thead>
                <tbody>
                  {latestSnapshot.serp
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((item) => {
                      const rowDomain = normalizeDomain(item.url);
                      const isTarget = normalizedDomain && rowDomain === normalizedDomain;
                      return (
                        <tr
                          key={`${item.position}-${item.url}`}
                          style={{
                            background: isTarget ? 'rgba(22, 163, 74, 0.2)' : 'rgba(15, 23, 42, 0.7)',
                          }}
                        >
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(31,41,55,0.7)', color: '#e5e7eb' }}>
                            #{item.position}
                          </td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(31,41,55,0.7)' }}>
                            <div style={{ color: '#f9fafb', fontWeight: 500, marginBottom: 2 }}>{item.title || '(No title)'}</div>
                            <div style={{ fontSize: 11 }}>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: '#93c5fd', textDecoration: 'none', wordBreak: 'break-all' }}
                              >
                                {item.url}
                              </a>
                            </div>
                          </td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(31,41,55,0.7)', color: '#d1d5db', fontSize: 11 }}>
                            {rowDomain || '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  fontSize: 13,
                }}
              >
                {isLoading
                  ? 'Analyzing SERP…'
                  : 'Enter a keyword, target domain, and location, then run SERP Analysis.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function normalizeDomain(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return trimmed;
  try {
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const u = new URL(url);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return trimmed.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  }
}

export default SerpAnalysis;

