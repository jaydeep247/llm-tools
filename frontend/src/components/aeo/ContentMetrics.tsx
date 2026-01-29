import React from 'react';
import { ContentMetrics as ContentMetricsType } from './types';
import '../../pages/AEODashboard.css';

interface EntityMetrics {
  entities_detected_count: number;
  entity_coverage_score: number;
  entity_relevance_score: number;
  entity_relevance_details?: {
    relevance_explanation?: string;
    relevant_entities?: string[];
    irrelevant_entities?: string[];
  };
}

interface ContentMetricsProps {
  contentMetrics?: ContentMetricsType;
  entityMetrics?: EntityMetrics;
}

const ContentMetrics: React.FC<ContentMetricsProps> = ({ contentMetrics, entityMetrics }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#EF4444';
    return '#6B7280';
  };

  const intentDefinitions: Record<string, string> = {
    informational: 'Knowledge-seeking queries (how, what, why, guides, explanations)',
    commercial: 'Product/service research and commercial investigation queries',
    comparative: 'Queries comparing options, tools, or providers',
    transactional: 'Purchase or action-focused queries (buy, sign up, download, book)',
    agent_style: 'Chatbot/assistant-style prompts (conversational, multi-step help)',
    other: 'Prompts that do not clearly map to the main intent types'
  };

  const intentKeysInOrder: string[] = [
    'informational',
    'commercial',
    'comparative',
    'transactional',
    'agent_style'
  ];

  if (!contentMetrics) {
    return (
      <div className="content-metrics-container">
        <div className="no-data-message">
          <p>No content metrics available. Run an AEO analysis to see content insights.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-metrics-container">
      <div className="content-metrics-header">
        <h2>Content Analysis Metrics</h2>
        <p className="subtitle">AI-powered analysis of your content type, search intent, and visibility potential</p>
      </div>

      <div className="content-metrics-grid">
        {/* Content Type Accuracy */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">📄</div>
            <div>
              <h3>Content Type Accuracy</h3>
              <p className="metric-description">How accurately the system identifies your content type</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div
                className="score-circle-large"
                style={{
                  '--progress': contentMetrics.content_type_accuracy,
                  '--color': getScoreColor(contentMetrics.content_type_accuracy)
                } as React.CSSProperties}
              >
                <div className="score-value-large">{contentMetrics.content_type_accuracy}</div>
              </div>
            </div>
            <div className="metric-info">
              <div className="info-label">Suggested Type:</div>
              <div className="info-value type-badge">
                {contentMetrics.suggested_content_type || 'Unknown'}
              </div>
            </div>
          </div>
        </div>

        {/* Prompt Intent Match */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">🎯</div>
            <div>
              <h3>Prompt Intent Match</h3>
              <p className="metric-description">How well your content matches user search intent</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div
                className="score-circle-large"
                style={{
                  '--progress': contentMetrics.prompt_intent_match,
                  '--color': getScoreColor(contentMetrics.prompt_intent_match)
                } as React.CSSProperties}
              >
                <div className="score-value-large">{contentMetrics.prompt_intent_match}</div>
              </div>
            </div>
            <div className="metric-info">
              <div className="info-label">Matched Intents:</div>
              <div className="intent-tags">
                {contentMetrics.prompt_intent_details?.matched_intents?.length > 0 ? (
                  contentMetrics.prompt_intent_details.matched_intents.map((intent, idx) => (
                    <span key={idx} className="intent-tag">{intent}</span>
                  ))
                ) : (
                  <span className="no-data">No intents detected</span>
                )}
              </div>
              {contentMetrics.prompt_intent_details?.confidence !== undefined && (
                <div className="confidence-score">
                  Confidence: {contentMetrics.prompt_intent_details.confidence}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Visibility Impact */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">📈</div>
            <div>
              <h3>Visibility Impact</h3>
              <p className="metric-description">Potential impact on search visibility and ranking</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div
                className="score-circle-large"
                style={{
                  '--progress': contentMetrics.visibility_impact,
                  '--color': getScoreColor(contentMetrics.visibility_impact)
                } as React.CSSProperties}
              >
                <div className="score-value-large">{contentMetrics.visibility_impact}</div>
              </div>
            </div>
            <div className="metric-info">
              <div className="info-label">Key Factors:</div>
              <div className="factor-tags">
                {contentMetrics.visibility_factors?.factors?.length > 0 ? (
                  contentMetrics.visibility_factors.factors.map((factor, idx) => (
                    <span key={idx} className="factor-tag">{factor}</span>
                  ))
                ) : (
                  <span className="no-data">No factors identified</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt Intent Clusters Section */}
      {contentMetrics.prompt_intent_details?.cluster_metrics &&
        contentMetrics.prompt_intent_details?.intent_clusters && (
          <div className="prompt-clusters-section" style={{ marginTop: '30px' }}>
            <div className="section-header">
              <h2>Prompt Intent Clusters</h2>
              <p className="subtitle">
                Classification of user prompts by intent type with clustering accuracy and distribution metrics
              </p>
            </div>

            {/* Metrics / Parameters Matrix */}
            <div
              style={{
                marginTop: '20px',
                marginBottom: '30px',
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid rgba(148, 163, 184, 0.3)'
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#e5e7eb' }}>
                📊 Clustering Metrics & Parameters
              </h3>
              
              {/* Overall Metrics Summary */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '15px',
                  marginBottom: '20px'
                }}
              >
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                    Accuracy of Clustering
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981' }}>
                    {Math.round(
                      100 *
                        (contentMetrics.prompt_intent_details.cluster_metrics.clustering_accuracy ?? 0)
                    )}%
                  </div>
                </div>
                
                <div
                  style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                    Total Prompts Analyzed
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#3b82f6' }}>
                    {contentMetrics.prompt_intent_details.cluster_metrics.total_prompts ?? 0}
                  </div>
                </div>
                
                <div
                  style={{
                    background: 'rgba(168, 85, 247, 0.1)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                    % Successfully Categorized
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#a855f7' }}>
                    {contentMetrics.prompt_intent_details.cluster_metrics.coverage_percentage?.toFixed(1) ?? 0}%
                  </div>
                </div>
              </div>

              {/* Intent Distribution Table */}
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
              >
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.9)' }}>
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: '#e5e7eb',
                        borderBottom: '2px solid rgba(148, 163, 184, 0.4)'
                      }}
                    >
                      Intent Cluster
                    </th>
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#e5e7eb',
                        borderBottom: '2px solid rgba(148, 163, 184, 0.4)'
                      }}
                    >
                      Number of Prompts
                    </th>
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#e5e7eb',
                        borderBottom: '2px solid rgba(148, 163, 184, 0.4)'
                      }}
                    >
                      % of Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const clusters: any =
                      contentMetrics.prompt_intent_details?.intent_clusters || {};
                    const total: number =
                      contentMetrics.prompt_intent_details?.cluster_metrics?.total_prompts ?? 0;

                    const labelMap: Record<string, string> = {
                      informational: 'Informational',
                      commercial: 'Commercial',
                      comparative: 'Comparative',
                      transactional: 'Transactional',
                      agent_style: 'Agent-style'
                    };

                    const iconMap: Record<string, string> = {
                      informational: '📚',
                      commercial: '🛍️',
                      comparative: '⚖️',
                      transactional: '💳',
                      agent_style: '🤖'
                    };

                    return (
                      <>
                        {intentKeysInOrder.map((key, idx) => {
                          const cluster = clusters[key] || {};
                          const count: number = cluster.prompt_count ?? 0;
                          const percent = total > 0 ? Math.round((count / total) * 100) : 0;

                          return (
                            <tr
                              key={key}
                              style={{
                                borderBottom:
                                  idx < intentKeysInOrder.length - 1
                                    ? '1px solid rgba(148, 163, 184, 0.2)'
                                    : 'none'
                              }}
                            >
                              <td style={{ padding: '10px 12px', color: '#e5e7eb' }}>
                                <span style={{ marginRight: '8px' }}>{iconMap[key]}</span>
                                {labelMap[key]}
                              </td>
                              <td
                                style={{
                                  padding: '10px 12px',
                                  textAlign: 'center',
                                  fontWeight: 600,
                                  color: '#e5e7eb'
                                }}
                              >
                                {count}
                              </td>
                              <td
                                style={{
                                  padding: '10px 12px',
                                  textAlign: 'center',
                                  color: '#e5e7eb'
                                }}
                              >
                                <span
                                  style={{
                                    background: `rgba(${
                                      percent >= 20 ? '16, 185, 129' : '107, 114, 128'
                                    }, 0.2)`,
                                    padding: '4px 12px',
                                    borderRadius: '4px',
                                    fontWeight: 600
                                  }}
                                >
                                  {percent}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        
                        {/* Other / Uncategorized row */}
                        {(() => {
                          const sumKnown = intentKeysInOrder.reduce((sum, key) => {
                            const c = clusters[key];
                            return sum + (c?.prompt_count ?? 0);
                          }, 0);
                          const otherCount = Math.max(total - sumKnown, 0);
                          const otherPercent = total > 0 ? Math.round((otherCount / total) * 100) : 0;

                          return (
                            <tr style={{ borderTop: '2px solid rgba(148, 163, 184, 0.4)' }}>
                              <td style={{ padding: '10px 12px', color: '#9ca3af' }}>
                                <span style={{ marginRight: '8px' }}>❓</span>
                                Other / Uncategorized
                              </td>
                              <td
                                style={{
                                  padding: '10px 12px',
                                  textAlign: 'center',
                                  fontWeight: 600,
                                  color: '#9ca3af'
                                }}
                              >
                                {otherCount}
                              </td>
                              <td
                                style={{
                                  padding: '10px 12px',
                                  textAlign: 'center',
                                  color: '#9ca3af'
                                }}
                              >
                                <span
                                  style={{
                                    background: 'rgba(107, 114, 128, 0.2)',
                                    padding: '4px 12px',
                                    borderRadius: '4px',
                                    fontWeight: 600
                                  }}
                                >
                                  {otherPercent}%
                                </span>
                              </td>
                            </tr>
                          );
                        })()}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* Entity Metrics Section */}
      {entityMetrics && (
        <div className="entity-metrics-section">
          <div className="section-header">
            <h2>Entity Detection Metrics</h2>
            <p className="subtitle">Analysis of required entities and their relevance to search intent</p>
          </div>
          
          <div className="entity-metrics-grid">
            {/* Number of Required Entities Detected */}
            <div className="entity-metric-card">
              <div className="metric-card-header">
                <div className="metric-icon-large">🔢</div>
                <div>
                  <h3>Entities Detected</h3>
                  <p className="metric-description">Number of required entities found in content</p>
                </div>
              </div>
              <div className="metric-card-body">
                <div className="entity-count-display">
                  <div className="count-value">{entityMetrics.entities_detected_count}</div>
                  <div className="count-label">entities found</div>
                </div>
              </div>
            </div>

            {/* Coverage Score */}
            <div className="entity-metric-card">
              <div className="metric-card-header">
                <div className="metric-icon-large">📊</div>
                <div>
                  <h3>Coverage Score</h3>
                  <p className="metric-description">Percentage of required entities included</p>
                </div>
              </div>
              <div className="metric-card-body">
                <div className="metric-score-display">
                  <div
                    className="score-circle-large"
                    style={{
                      '--progress': entityMetrics.entity_coverage_score,
                      '--color': getScoreColor(entityMetrics.entity_coverage_score)
                    } as React.CSSProperties}
                  >
                    <div className="score-value-large">{entityMetrics.entity_coverage_score}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Entity Relevance */}
            <div className="entity-metric-card">
              <div className="metric-card-header">
                <div className="metric-icon-large">🎯</div>
                <div>
                  <h3>Entity Relevance</h3>
                  <p className="metric-description">How relevant entities are to search intent</p>
                </div>
              </div>
              <div className="metric-card-body">
                <div className="metric-score-display">
                  <div
                    className="score-circle-large"
                    style={{
                      '--progress': entityMetrics.entity_relevance_score,
                      '--color': getScoreColor(entityMetrics.entity_relevance_score)
                    } as React.CSSProperties}
                  >
                    <div className="score-value-large">{entityMetrics.entity_relevance_score}</div>
                  </div>
                </div>
                {entityMetrics.entity_relevance_details?.relevance_explanation && (
                  <div className="metric-info">
                    <div className="info-label">Explanation:</div>
                    <div className="info-value explanation-text">
                      {entityMetrics.entity_relevance_details.relevance_explanation}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Entity Details */}
          {(entityMetrics.entity_relevance_details?.relevant_entities &&
            entityMetrics.entity_relevance_details.relevant_entities.length > 0) ||
          (entityMetrics.entity_relevance_details?.irrelevant_entities &&
            entityMetrics.entity_relevance_details.irrelevant_entities.length > 0) ? (
            <div className="entity-details-section">
              {entityMetrics.entity_relevance_details?.relevant_entities &&
                entityMetrics.entity_relevance_details.relevant_entities.length > 0 && (
                <div className="details-card">
                  <h3 className="details-title">
                    <span className="details-icon">✅</span>
                    Relevant Entities
                  </h3>
                  <div className="entity-tags">
                    {entityMetrics.entity_relevance_details.relevant_entities.map((entity, idx) => (
                      <span key={idx} className="entity-tag relevant">{entity}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {entityMetrics.entity_relevance_details?.irrelevant_entities &&
                entityMetrics.entity_relevance_details.irrelevant_entities.length > 0 && (
                <div className="details-card">
                  <h3 className="details-title">
                    <span className="details-icon">⚠️</span>
                    Irrelevant Entities
                  </h3>
                  <div className="entity-tags">
                    {entityMetrics.entity_relevance_details.irrelevant_entities.map((entity, idx) => (
                      <span key={idx} className="entity-tag irrelevant">{entity}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Detailed Breakdown */}
      <div className="content-metrics-details-section">
        {/* Search Queries */}
        {contentMetrics.prompt_intent_details?.search_queries?.length > 0 && (
          <div className="details-card">
            <h3 className="details-title">
              <span className="details-icon">🔍</span>
              Top Search Queries
            </h3>
            <div className="search-queries-list">
              {contentMetrics.prompt_intent_details.search_queries.map((query, idx) => (
                <div key={idx} className="search-query-item">
                  <span className="query-number">{idx + 1}</span>
                  <span className="query-text">"{query}"</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Visibility Score Breakdown */}
        {contentMetrics.visibility_factors?.score_breakdown && 
         Object.keys(contentMetrics.visibility_factors.score_breakdown).length > 0 && (
          <div className="details-card">
            <h3 className="details-title">
              <span className="details-icon">📊</span>
              Visibility Score Breakdown
            </h3>
            <div className="score-breakdown">
              {Object.entries(contentMetrics.visibility_factors.score_breakdown).map(([factor, score]) => (
                <div key={factor} className="breakdown-item">
                  <div className="breakdown-label">{factor.replace(/_/g, ' ')}</div>
                  <div className="breakdown-progress">
                    <div className="breakdown-bar">
                      <div
                        className="breakdown-fill"
                        style={{
                          width: `${score}%`,
                          backgroundColor: getScoreColor(score)
                        }}
                      ></div>
                    </div>
                    <div className="breakdown-score">{score}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ContentMetrics;

