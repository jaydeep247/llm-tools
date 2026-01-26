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
          {(entityMetrics.entity_relevance_details?.relevant_entities?.length > 0 || 
            entityMetrics.entity_relevance_details?.irrelevant_entities?.length > 0) && (
            <div className="entity-details-section">
              {entityMetrics.entity_relevance_details?.relevant_entities?.length > 0 && (
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
              
              {entityMetrics.entity_relevance_details?.irrelevant_entities?.length > 0 && (
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
          )}
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

