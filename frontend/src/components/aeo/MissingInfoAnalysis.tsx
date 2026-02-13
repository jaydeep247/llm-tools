import React, { useState, useEffect } from 'react';
import { useLazyAnalyzeMissingInfoQuery } from '../../store/api/module_C/missingInfoAnalysisApi';
import '../../pages/AEODashboard.css';

interface MissingEntity {
  entity: string;
  weight: number;
  reason: string;
}

interface MissingInfoSummary {
  expected_count: number;
  present_count: number;
  missing_count: number;
  gap_percentage: number;
  weighted_gap_score: number;
}

interface MissingInfoAnalysisData {
  summary: MissingInfoSummary;
  critical_missing: MissingEntity[];
  minor_missing: MissingEntity[];
}

interface MissingInfoAnalysisProps {
  url?: string;
  sessionId?: number;
}

const MissingInfoAnalysis: React.FC<MissingInfoAnalysisProps> = ({
  url,
  sessionId
}) => {
  const [analyzeMissingInfo, { data: analysisData, isLoading, error: queryError }] = useLazyAnalyzeMissingInfoQuery();
  const [showCritical, setShowCritical] = useState(true);
  const [showMinor, setShowMinor] = useState(false);

  // Extract data from RTK Query response
  const data: MissingInfoAnalysisData | null = analysisData?.success ? {
    summary: analysisData.summary || analysisData.data?.summary!,
    critical_missing: analysisData.critical_missing || analysisData.data?.critical_missing || [],
    minor_missing: analysisData.minor_missing || analysisData.data?.minor_missing || []
  } : null;

  const error = queryError ?
    (typeof queryError === 'object' && 'data' in queryError && queryError.data &&
      typeof queryError.data === 'object' && 'error' in queryError.data ?
      (queryError.data as any).error : 'An error occurred') :
    (!analysisData?.success ? analysisData?.error : null);

  const loading = isLoading;

  useEffect(() => {
    if (url) {
      performAnalysis();
    }
  }, [url, sessionId]);

  const performAnalysis = async () => {
    if (!url) {
      return;
    }

    try {
      await analyzeMissingInfo(url).unwrap();
    } catch (err) {
      console.error('Missing information analysis error:', err);
    }
  };

  const getGapSeverityColor = (percentage: number) => {
    if (percentage <= 20) return '#4CAF50'; // Green - good coverage
    if (percentage <= 40) return '#FF9800'; // Orange - moderate gaps
    return '#f44336'; // Red - significant gaps
  };

  const getWeightedScoreColor = (score: number) => {
    if (score <= 0.3) return '#4CAF50'; // Green - low weighted gaps
    if (score <= 0.6) return '#FF9800'; // Orange - moderate weighted gaps
    return '#f44336'; // Red - high weighted gaps
  };

  const getMissingEntityIcon = (weight: number) => {
    if (weight >= 8) return '🚨'; // Critical
    if (weight >= 6) return '⚠️'; // Medium
    return '💡'; // Minor
  };

  if (loading) {
    return (
      <div className="content-metrics-content">
        <div className="loading-state">
          <h3>🔍 Missing Information Analysis</h3>
          <div className="loading-spinner"></div>
          <p>Analyzing missing information gaps...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-metrics-content">
        <div className="error-state">
          <h3>🔍 Missing Information Analysis</h3>
          <p className="error-message">❌ {error}</p>
          {url && (
            <button 
              className="retry-button"
              onClick={performAnalysis}
            >
              🔄 Retry Analysis
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="content-metrics-content">
        <div className="empty-state">
          <h3>🔍 Missing Information Analysis</h3>
          <p>Identify gaps in expected information that AI systems look for when generating answers.</p>
          {!url && (
            <div className="info-box">
              <p><strong>To get started:</strong></p>
              <ul>
                <li>Enter a URL in the analysis form</li>
                <li>Click "Analyze" to identify missing information</li>
              </ul>
            </div>
          )}
          <div className="tooltip-info">
            <small>💡 This analysis helps identify facts and entities that AI expects but weren't found on your page.</small>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-metrics-content">
      <div className="missing-info-analysis">
        <h3>🔍 Missing Information Analysis</h3>
        <p className="subtitle">AI-expected information gaps detected in your content</p>

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card text-center">
            <h4>Total Missing</h4>
            <div className="metric-display">
              <span className="metric-value large" style={{ 
                color: data.summary.missing_count === 0 ? '#4CAF50' : '#f44336' 
              }}>
                {data.summary.missing_count}
              </span>
              <span className="metric-label text-center">entities</span>
            </div>
          </div>

          <div className="summary-card text-center">
            <h4>Gap Percentage</h4>
            <div className="metric-display">
              <span
                className="metric-value large"
                style={{ color: getGapSeverityColor(data.summary.gap_percentage) }}
              >
                {data.summary.gap_percentage}%
              </span>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${data.summary.gap_percentage}%`,
                    backgroundColor: getGapSeverityColor(data.summary.gap_percentage)
                  }}
                />
              </div>
            </div>
          </div>

          <div className="summary-card text-center">
            <h4>Weighted Gap Score</h4>
            <div className="metric-display">
              <span
                className="metric-value large"
                style={{ color: getWeightedScoreColor(data.summary.weighted_gap_score) }}
              >
                {data.summary.weighted_gap_score.toFixed(2)}
              </span>
              <span className="metric-label text-center">importance-weighted</span>
            </div>
          </div>
        </div>

        {/* Missing Entities Analysis */}
        {(data.critical_missing.length > 0 || data.minor_missing.length > 0) && (
          <div className="analysis-section">
            <h4>📋 Missing Entities by Severity</h4>
            
            <div className="entity-tabs">
              <button
                className={`tab-button ${showCritical ? 'active' : ''}`}
                onClick={() => { setShowCritical(true); setShowMinor(false); }}
              >
                🚨 Critical ({data.critical_missing.length})
              </button>
              <button
                className={`tab-button ${showMinor ? 'active' : ''}`}
                onClick={() => { setShowMinor(true); setShowCritical(false); }}
              >
                💡 Minor ({data.minor_missing.length})
              </button>
            </div>

            {showCritical && data.critical_missing.length > 0 && (
              <div className="missing-entities-list critical">
                <h5 className="section-title">🚨 Critical Missing Information</h5>
                <p className="section-description">These are high-impact entities that significantly affect AI answer generation:</p>
                {data.critical_missing.map((entity, index) => (
                  <div key={index} className="entity-item critical-item">
                    <div className="entity-header">
                      <span className="entity-icon">{getMissingEntityIcon(entity.weight)}</span>
                      <span className="entity-name">{entity.entity}</span>
                      <span className="entity-weight">Weight: {entity.weight}</span>
                    </div>
                    <div className="entity-reason">{entity.reason}</div>
                  </div>
                ))}
              </div>
            )}

            {showMinor && data.minor_missing.length > 0 && (
              <div className="missing-entities-list minor">
                <h5 className="section-title">💡 Minor Missing Information</h5>
                <p className="section-description">These entities would enhance completeness but have lower impact:</p>
                {data.minor_missing.map((entity, index) => (
                  <div key={index} className="entity-item minor-item">
                    <div className="entity-header">
                      <span className="entity-icon">{getMissingEntityIcon(entity.weight)}</span>
                      <span className="entity-name">{entity.entity}</span>
                      <span className="entity-weight">Weight: {entity.weight}</span>
                    </div>
                    <div className="entity-reason">{entity.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Coverage Overview */}
        <div className="analysis-section">
          <h4>📊 Coverage Overview</h4>
          <div className="summary-cards">
            <div className="summary-card text-center">
              <h4>Expected Entities</h4>
              <div className="metric-display">
                <span className="metric-value large total">{data.summary.expected_count}</span>
              </div>
            </div>
            <div className="summary-card text-center">
              <h4>Present Entities</h4>
              <div className="metric-display">
                <span className="metric-value large present">{data.summary.present_count}</span>
              </div>
            </div>
            <div className="summary-card text-center">
              <h4>Missing Entities</h4>
              <div className="metric-display">
                <span className="metric-value large missing">{data.summary.missing_count}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Insights */}
        <div className="analysis-section">
          <h4>💡 Insights & Recommendations</h4>
          <div className="insights-list">
            {data.summary.gap_percentage === 0 && (
              <div className="insight-item success">
                <strong>Excellent Coverage:</strong> Your content includes all expected information entities for comprehensive AI answer generation.
              </div>
            )}

            {data.summary.gap_percentage > 0 && data.summary.gap_percentage <= 20 && (
              <div className="insight-item success">
                <strong>Good Coverage:</strong> Minor gaps detected. Consider adding the missing entities for enhanced completeness.
              </div>
            )}

            {data.summary.gap_percentage > 20 && data.summary.gap_percentage <= 40 && (
              <div className="insight-item warning">
                <strong>Moderate Gaps:</strong> Some important information is missing. Focus on critical missing entities first.
              </div>
            )}

            {data.summary.gap_percentage > 40 && (
              <div className="insight-item error">
                <strong>Significant Gaps:</strong> Major information gaps detected. Your content may struggle to compete in AI answer generation. Prioritize adding critical missing entities.
              </div>
            )}

            {data.summary.weighted_gap_score > 0.6 && (
              <div className="insight-item error">
                <strong>High-Impact Gaps:</strong> The missing information carries high importance weights. Adding these entities would significantly improve AI coverage.
              </div>
            )}

            {data.critical_missing.length > 0 && (
              <div className="insight-item warning">
                <strong>Action Required:</strong> {data.critical_missing.length} critical entities are missing. These are essential for comprehensive topic coverage.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissingInfoAnalysis;