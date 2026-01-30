import React from 'react';
import '../../pages/AEODashboard.css';

interface AnswerCompletenessData {
  overall_score: number;
  completeness_percentage: number;
  key_aspects_covered: string[];
  missing_aspects: string[];
  depth_score: number;
  breadth_score: number;
  relevance_score: number;
  recommendations?: string[];
}

interface AnswerCompletenessScoreProps {
  completenessData?: AnswerCompletenessData;
}

const AnswerCompletenessScore: React.FC<AnswerCompletenessScoreProps> = ({ completenessData }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#EF4444';
    return '#6B7280';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Very Good';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 50) return 'Needs Improvement';
    return 'Poor';
  };

  if (!completenessData) {
    return (
      <div className="content-metrics-container">
        <div className="no-data-message">
          <p>No answer completeness data available. Run an AEO analysis to see completeness insights.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-metrics-container">
      <div className="content-metrics-header">
        <h2>Answer Completeness Score</h2>
        <p className="subtitle">Comprehensive analysis of how completely your content answers user queries</p>
      </div>

      {/* Primary Metrics Grid */}
      <div className="content-metrics-grid">
        {/* Completeness Score */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">📊</div>
            <div>
              <h3>Completeness Score</h3>
              <p className="metric-description">Overall answer completeness (0-100)</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div
                className="score-circle-large"
                style={{
                  '--progress': completenessData.overall_score,
                  '--color': getScoreColor(completenessData.overall_score)
                } as React.CSSProperties}
              >
                <div className="score-value-large">{completenessData.overall_score}</div>
              </div>
            </div>
            <div className="metric-info">
              <div className="score-label-display">
                {getScoreLabel(completenessData.overall_score)}
              </div>
            </div>
          </div>
        </div>

        {/* Questions Fully Answered */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">✅</div>
            <div>
              <h3>Questions Answered</h3>
              <p className="metric-description">% of questions fully answered</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div
                className="score-circle-large"
                style={{
                  '--progress': completenessData.completeness_percentage,
                  '--color': getScoreColor(completenessData.completeness_percentage)
                } as React.CSSProperties}
              >
                <div className="score-value-large">{completenessData.completeness_percentage}%</div>
              </div>
            </div>
            <div className="metric-info">
              <div className="info-label">Coverage Status</div>
              <div className="info-value">
                {completenessData.key_aspects_covered.length} answered, {completenessData.missing_aspects.length} missing
              </div>
            </div>
          </div>
        </div>

        {/* Missing / Partial Coverage */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">⚠️</div>
            <div>
              <h3>Missing Coverage</h3>
              <p className="metric-description">Gaps in answer completeness</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div className="large-stat-display">
                <div className="stat-number" style={{ color: completenessData.missing_aspects.length > 0 ? '#EF4444' : '#10B981' }}>
                  {completenessData.missing_aspects.length}
                </div>
                <div className="stat-label">Missing Aspects</div>
              </div>
            </div>
            <div className="metric-info">
              <div className="info-label">Partial Coverage</div>
              <div className="info-value">
                {100 - completenessData.completeness_percentage}% incomplete
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Metrics Grid */}
      <div className="content-metrics-grid" style={{ marginTop: '1.5rem' }}>
        {/* Depth Score */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">🔍</div>
            <div>
              <h3>Depth Score</h3>
              <p className="metric-description">How thoroughly topics are covered</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div
                className="score-circle-large"
                style={{
                  '--progress': completenessData.depth_score,
                  '--color': getScoreColor(completenessData.depth_score)
                } as React.CSSProperties}
              >
                <div className="score-value-large">{completenessData.depth_score}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Breadth Score */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">📚</div>
            <div>
              <h3>Breadth Score</h3>
              <p className="metric-description">Range of topics and aspects addressed</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div
                className="score-circle-large"
                style={{
                  '--progress': completenessData.breadth_score,
                  '--color': getScoreColor(completenessData.breadth_score)
                } as React.CSSProperties}
              >
                <div className="score-value-large">{completenessData.breadth_score}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Relevance Score */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">🎯</div>
            <div>
              <h3>Relevance Score</h3>
              <p className="metric-description">How relevant content is to user intent</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div
                className="score-circle-large"
                style={{
                  '--progress': completenessData.relevance_score,
                  '--color': getScoreColor(completenessData.relevance_score)
                } as React.CSSProperties}
              >
                <div className="score-value-large">{completenessData.relevance_score}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Aspects Coverage */}
      <div className="content-metrics-details-section">
        {completenessData.key_aspects_covered.length > 0 && (
          <div className="details-card">
            <h3 className="details-title">
              <span className="details-icon">✅</span>
              Key Aspects Covered ({completenessData.key_aspects_covered.length})
            </h3>
            <div className="aspect-tags">
              {completenessData.key_aspects_covered.map((aspect, idx) => (
                <span key={idx} className="aspect-tag covered">{aspect}</span>
              ))}
            </div>
          </div>
        )}

        {completenessData.missing_aspects.length > 0 && (
          <div className="details-card">
            <h3 className="details-title">
              <span className="details-icon">⚠️</span>
              Missing Aspects ({completenessData.missing_aspects.length})
            </h3>
            <div className="aspect-tags">
              {completenessData.missing_aspects.map((aspect, idx) => (
                <span key={idx} className="aspect-tag missing">{aspect}</span>
              ))}
            </div>
          </div>
        )}

        {completenessData.recommendations && completenessData.recommendations.length > 0 && (
          <div className="details-card">
            <h3 className="details-title">
              <span className="details-icon">💡</span>
              Recommendations
            </h3>
            <div className="recommendations-list">
              {completenessData.recommendations.map((rec, idx) => (
                <div key={idx} className="recommendation-item">
                  <span className="rec-number">{idx + 1}</span>
                  <span className="rec-text">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnswerCompletenessScore;
