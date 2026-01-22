import React from 'react';
import { apiService } from '../../services/api/api';

interface IntelligenceModuleProps {
  auditMode: 'single' | 'bulk';
  setAuditMode: (mode: 'single' | 'bulk') => void;
  sitemapUrl: string;
  setSitemapUrl: (url: string) => void;
  bulkLoading: boolean;
  bulkResults: any;
  result?: any;
  handleBulkAnalyze: () => void;
}

const IntelligenceModule: React.FC<IntelligenceModuleProps> = ({
  auditMode,
  setAuditMode,
  sitemapUrl,
  setSitemapUrl,
  bulkLoading,
  bulkResults,
  result,
  handleBulkAnalyze
}) => {
  return (
    <div className="dashboard-card" style={{ padding: '2rem' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h3>🧠 Module C: AI Intelligence Engine</h3>
        <div className="mode-toggle" style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
          <button
            onClick={() => setAuditMode('single')}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: auditMode === 'single' ? '#fff' : 'transparent',
              boxShadow: auditMode === 'single' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              fontWeight: auditMode === 'single' ? '600' : '400',
              color: auditMode === 'single' ? '#0f172a' : '#64748b',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            AEO Checker
          </button>
          <button
            onClick={() => setAuditMode('bulk')}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: auditMode === 'bulk' ? '#fff' : 'transparent',
              boxShadow: auditMode === 'bulk' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              fontWeight: auditMode === 'bulk' ? '600' : '400',
              color: auditMode === 'bulk' ? '#0f172a' : '#64748b',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            LLM-Friendliness Bulk Audit
          </button>
        </div>
      </div>

      {auditMode === 'single' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '1rem' }}>
          {/* 1. Main Score Card (Left) */}
          <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
            <h4 style={{ color: '#64748b', marginBottom: '1rem', fontWeight: 'bold' }}>LLM-Friendliness Score</h4>
            <div className="score-circle" style={{
              '--progress': result?.metrics?.llm_friendliness_score || result?.overall_score || 0,
              width: '140px',
              height: '140px',
              margin: '0 auto'
            } as React.CSSProperties}>
              <div className="score-value" style={{ fontSize: '2.5rem' }}>
                {result?.metrics?.llm_friendliness_score || result?.overall_score || 0}
              </div>
            </div>
            <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#64748b', lineHeight: '1.5' }}>
              <strong>Strict Analysis:</strong> How easily AI models can understand, trust, and use your content.
            </p>
          </div>

          {/* 2. Strict Metrics List (Right) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Metric 1: Entity Presence Ratio */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 'bold', color: '#475569' }}>🏷️ Entity Presence Ratio</span>
                <span style={{ fontWeight: 800, color: '#3b82f6', fontSize: '1.1rem' }}>
                  {result?.metrics?.entity_presence_ratio || 0}%
                </span>
              </div>
              <div className="progress-bar" style={{ height: '8px', background: '#f1f5f9' }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${result?.metrics?.entity_presence_ratio || 0}%`,
                    backgroundColor: (result?.metrics?.entity_presence_ratio || 0) > 70 ? '#10B981' : '#F59E0B'
                  }}
                ></div>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                Measures the ratio of key entities found vs. expected.
              </p>
            </div>

            {/* Metric 2: Structured Data Completeness */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 'bold', color: '#475569' }}>🔧 Structured Data Completeness</span>
                <span style={{ fontWeight: 800, color: '#3b82f6', fontSize: '1.1rem' }}>
                  {result?.metrics?.structured_data_completeness || 0}%
                </span>
              </div>
              <div className="progress-bar" style={{ height: '8px', background: '#f1f5f9' }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${result?.metrics?.structured_data_completeness || 0}%`,
                    backgroundColor: (result?.metrics?.structured_data_completeness || 0) > 80 ? '#10B981' : '#F59E0B'
                  }}
                ></div>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                Completeness of Schema.org implementation.
              </p>
            </div>

            {/* Metric 3: Readability Score */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 'bold', color: '#475569' }}>📖 Readability Score</span>
                <span style={{ fontWeight: 800, color: '#3b82f6', fontSize: '1.1rem' }}>
                  {result?.metrics?.readability_score || 0}
                </span>
              </div>
              <div className="progress-bar" style={{ height: '8px', background: '#f1f5f9' }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${result?.metrics?.readability_score || 0}%`,
                    backgroundColor: (result?.metrics?.readability_score || 0) > 60 ? '#10B981' : '#F59E0B'
                  }}
                ></div>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                Flesch-Kincaid Score (Target: 60+ for clear AI parsing).
              </p>
            </div>
          </div>
        </div>
      )}

      {auditMode === 'bulk' && (
        <div className="bulk-audit-container" style={{ marginTop: '2rem' }}>
          {/* Bulk Input Section */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
            <input
              type="text"
              placeholder="Enter Sitemap URL (e.g. https://firstbud.in/sitemap.xml)"
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                color: 'black',
                fontSize: '1rem'
              }}
            />
            <button
              onClick={handleBulkAnalyze}
              disabled={bulkLoading}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                background: '#7c3aed',
                color: 'white',
                fontWeight: '600',
                cursor: bulkLoading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: bulkLoading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {bulkLoading ? 'Scanning...' : '🚀 Run Bulk Audit'}
            </button>
          </div>

          {/* Loading State */}
          {bulkLoading && (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem', width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <p>Crawling & Analyzing pages... This may take a while.</p>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Bulk Results */}
          {bulkResults && !bulkLoading && (
            <div className="bulk-results">
              {/* 1. Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ background: '#f0f9ff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: '0.9rem', color: '#0369a1', marginBottom: '0.5rem', fontWeight: '600' }}>Avg LLM Score</div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#0ea5e9' }}>
                    {bulkResults?.summary?.average_llm_score || 0}
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', padding: '1.5rem', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '0.9rem', color: '#15803d', marginBottom: '0.5rem', fontWeight: '600' }}>Avg Readability</div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>
                    {bulkResults?.summary?.average_readability || 0}
                  </div>
                </div>

                <div style={{ background: '#fff7ed', padding: '1.5rem', borderRadius: '12px', border: '1px solid #fed7aa' }}>
                  <div style={{ fontSize: '0.9rem', color: '#c2410c', marginBottom: '0.5rem', fontWeight: '600' }}>Weak Content %</div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f97316' }}>
                    {bulkResults?.summary?.weak_content_ratio || 0}%
                  </div>
                </div>

                <div style={{ background: '#fff1f2', padding: '1.5rem', borderRadius: '12px', border: '1px solid #fecdd3' }}>
                  <div style={{ fontSize: '0.9rem', color: '#be123c', marginBottom: '0.5rem', fontWeight: '600' }}>Missing Entities %</div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f43f5e' }}>
                    {bulkResults?.summary?.missing_entities_ratio || 0}%
                  </div>
                </div>
              </div>

              {/* 2. Detailed Table */}
              <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', background: 'white' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#475569', fontWeight: '600' }}>Page URL</th>
                      <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>LLM Score</th>
                      <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Readability</th>
                      <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Entity Ratio</th>
                      <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Structure</th>
                      <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults?.details && bulkResults.details.map((row: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '1rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '500' }}>
                            {row.url}
                          </a>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            background: (row.llm_score || 0) >= 60 ? '#dcfce7' : '#fee2e2',
                            color: (row.llm_score || 0) >= 60 ? '#166534' : '#991b1b',
                            fontWeight: '700',
                            fontSize: '0.85rem'
                          }}>
                            {row.llm_score || 0}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#334155' }}>
                          {row.readability || 0}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#334155' }}>
                          {row.entities_ratio || 0}%
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#334155' }}>
                          {row.structure_score || 0}%
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          {row.status === 'Good'
                            ? <span style={{ color: '#10b981' }}>✅ Good</span>
                            : <span style={{ color: '#ef4444' }}>⚠️ Weak</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IntelligenceModule;