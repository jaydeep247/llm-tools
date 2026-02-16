import React, { useState, useEffect } from 'react';
import { useAnalyzeEntityCoverageMutation } from '../../store/api/module_C/entityCoverageAuditApi';
import '../../pages/AEODashboard.css';


interface DetectedEntity {
  name: string;
  type: 'heading' | 'noun_phrase' | 'repeated_concept';
  frequency: number;
  contextScore: number;
  firstFoundIn: string;
  relevanceScore: number;
}

interface EntityCoverageData {
  entityCoveragePercent: number;
  entityRelevanceScore: number;
  detectedEntities: DetectedEntity[];
  missingEntities: string[];
  expectedEntitiesCount: number;
  detectedEntitiesCount: number;
}

interface EntityCoverageAuditProps {
  url?: string;
  sessionId?: number;
  expectedEntities?: string[];
}

const EntityCoverageAudit: React.FC<EntityCoverageAuditProps> = ({
  url,
  sessionId,
  expectedEntities = []
}) => {
  const [showDetectedEntities, setShowDetectedEntities] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'heading' | 'noun_phrase' | 'repeated_concept'>('all');
  const [analyzeEntityCoverage, { data: analysisData, isLoading, error: mutationError }] = useAnalyzeEntityCoverageMutation();

  // Extract data from RTK Query response
  const data = analysisData?.success ? analysisData.data : null;
  const error = mutationError ?
    (typeof mutationError === 'object' && 'data' in mutationError && mutationError.data &&
      typeof mutationError.data === 'object' && 'error' in mutationError.data ?
      (mutationError.data as any).error : 'An error occurred') :
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
      await analyzeEntityCoverage({
        url,
        expectedEntities,
        sessionId,
      }).unwrap();
    } catch (err) {
      console.error('Entity coverage analysis error:', err);
    }
  };

  const getEntityTypeIcon = (type: string) => {
    switch (type) {
      case 'heading': return '📋';
      case 'noun_phrase': return '🔤';
      case 'repeated_concept': return '🔄';
      default: return '📝';
    }
  };

  const getEntityTypeColor = (type: string) => {
    switch (type) {
      case 'heading': return '#4CAF50';
      case 'noun_phrase': return '#2196F3';
      case 'repeated_concept': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  const getScoreColorForEntity = (type: string) => {
    switch (type) {
      case 'heading': return '#10b981'; // Green to match green entities
      case 'noun_phrase': return '#3b82f6'; // Blue to match blue entities  
      case 'repeated_concept': return '#f59e0b'; // Orange to match orange entities
      default: return '#6b7280'; // Gray for default
    }
  };

  const getCoverageColor = (percentage: number) => {
    if (percentage >= 80) return '#4CAF50';
    if (percentage >= 60) return '#FF9800';
    return '#f44336';
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#f44336';
  };

  const filterEntitiesByType = (entities: DetectedEntity[], type: string) => {
    if (type === 'all') return entities;
    return entities.filter(entity => entity.type === type);
  };

  const getTabLabel = (type: string, entities: DetectedEntity[]) => {
    const count = type === 'all' ? entities.length : entities.filter(e => e.type === type).length;
    switch (type) {
      case 'all': return `All (${count})`;
      case 'heading': return `📋 Headings (${count})`;
      case 'noun_phrase': return `🔠 Noun Phrases (${count})`;
      case 'repeated_concept': return `🔄 Repeated Concepts (${count})`;
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="content-metrics-content">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Analyzing entity coverage...</p>
          <small>This may take a few moments while we analyze the page content</small>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-metrics-content">
        <div className="error-container">
          <img src="/images/no-results.png" alt="No results found" />
          <h3>⚠️ Analysis Error</h3>
          <p>{error}</p>
          {url && (
            <button
              className="retry-button"
              onClick={performAnalysis}
              style={{ marginTop: '1rem' }}
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
          <h3>🏷️ Entity Coverage Audit</h3>
          <p>Analyze how well your content covers expected entities for your topic.</p>
          {!url && (
            <div className="info-box">
              <p><strong>To get started:</strong></p>
              <ul>
                <li>Enter a URL in the analysis form</li>
                <li>Click "Analyze" to begin entity coverage analysis</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="content-metrics-content">
      <div className="entity-coverage-audit">
        <h3>🏷️ Entity Coverage Audit</h3>
        <p className="subtitle">Analysis of entity presence and relevance in your content</p>

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <h4>Entity Coverage</h4>
            <div className="metric-display">
              <span
                className="metric-value"
                style={{ color: getCoverageColor(data.entityCoveragePercent) }}
              >
                {data.entityCoveragePercent}%
              </span>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${data.entityCoveragePercent}%`,
                    backgroundColor: getCoverageColor(data.entityCoveragePercent)
                  }}
                ></div>
              </div>
              <small>{data.detectedEntitiesCount} of {data.expectedEntitiesCount} expected entities found</small>
            </div>
          </div>

          <div className="summary-card">
            <h4>Entity Relevance Score</h4>
            <div className="metric-display">
              <span
                className="metric-value"
                style={{ color: getRelevanceColor(data.entityRelevanceScore) }}
              >
                {data.entityRelevanceScore}/100
              </span>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${data.entityRelevanceScore}%`,
                    backgroundColor: getRelevanceColor(data.entityRelevanceScore)
                  }}
                ></div>
              </div>
              <small>Based on frequency, context, and positioning</small>
            </div>
          </div>
        </div>

        {/* Missing Entities */}
        {data.missingEntities.length > 0 && (
          <div className="analysis-section">
            <h4>❌ Missing Entities ({data.missingEntities.length})</h4>
            <p className="section-description">
              Expected entities not found or insufficiently covered in your content
            </p>
            <div className="entity-tags missing-entities">
              {data.missingEntities.map((entity, index) => (
                <span key={index} className="entity-tag missing">
                  {entity}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Detected Entities */}
        <div className="analysis-section">
          <div className="entity-coverage-section-header">
            <div className="entity-coverage-header-content">
              <img src="/images/object.png" alt="Detected entities" />
              <h4>Detected Entities ({data.detectedEntities.length})</h4>
            </div>
            <button
              className="entity-coverage-toggle-button"
              onClick={() => setShowDetectedEntities(!showDetectedEntities)}
            >
              {showDetectedEntities ? '▼ Hide Details' : '▶ Show Details'}
            </button>
          </div>

          {!showDetectedEntities ? (
            <div className="entity-tags entity-coverage-detected-summary">
              {data.detectedEntities.slice(0, 10).map((entity, index) => (
                <span
                  key={index}
                  className="entity-tag"
                  style={{
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderLeft: `4px solid ${getEntityTypeColor(entity.type)}`,
                    borderRadius: '8px',
                    padding: '16px',
                    transition: 'border-color 0.2s'
                  }}
                >
                  {getEntityTypeIcon(entity.type)} {entity.name}
                  <small
                    className="relevance-score entity-tag">
                    {entity.relevanceScore}
                  </small>
                </span>
              ))}
              {data.detectedEntities.length > 10 && (
                <button
                  className="entity-tag more-indicator clickable"
                  onClick={() => setShowDetectedEntities(true)}
                >
                  +{data.detectedEntities.length - 10} more
                </button>
              )}
            </div>
          ) : (
            <div className="entity-coverage-detailed">
              {/* Entity Type Tabs */}
              <div className="entity-coverage-tabs" >
                {['all', 'heading', 'noun_phrase', 'repeated_concept'].map((tab) => (
                  <button
                    key={tab}
                    className={`entity-coverage-tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab as any)}
                  >
                    {getTabLabel(tab, data.detectedEntities)}
                  </button>
                ))}
              </div>

              {/* Filtered Entity List */}
              <div className="entity-coverage-list">
                {filterEntitiesByType(data.detectedEntities, activeTab).map((entity, index) => (
                  <div
                    key={index}
                    className="entity-item"
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid #374151',
                      borderLeft: `4px solid ${getEntityTypeColor(entity.type)}`,
                      borderRadius: '8px',
                      padding: '16px',
                      transition: 'border-color 0.2s'
                    }}
                  >
                    <div className="entity-header">
                      <span className="entity-name">
                        {getEntityTypeIcon(entity.type)} {entity.name}
                      </span>
                      <span className="relevance-score-badge">
                        {entity.relevanceScore}/100
                      </span>
                    </div>
                    <div className="entity-details">
                      <span className="entity-meta">
                        Type: {entity.type.replace('_', ' ')} |
                        Frequency: {entity.frequency} |
                        Found in: {entity.firstFoundIn} |
                        Context Score: {entity.contextScore}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {filterEntitiesByType(data.detectedEntities, activeTab).length === 0 && (
                <div className="entity-coverage-empty-state">
                  <img src="/images/planet.png" alt="No entities found" />
                  <p>No entities found for this category.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="analysis-section">
          <h4>💡 Insights & Recommendations</h4>
          <div className="insights-list">
            {data.entityCoveragePercent < 60 && (
              <div className="insight-item warning">
                <strong>Low Entity Coverage:</strong> Consider adding content about the missing entities
                to improve topical comprehensiveness.
              </div>
            )}

            {data.entityRelevanceScore < 70 && (
              <div className="insight-item warning">
                <strong>Low Relevance Score:</strong> Try mentioning key entities more frequently
                and in important sections like headings.
              </div>
            )}

            {data.missingEntities.length > data.detectedEntitiesCount && (
              <div className="insight-item error">
                <strong>Content Gap Detected:</strong> You're missing more entities than you're covering.
                Consider expanding content scope.
              </div>
            )}

            {data.entityCoveragePercent >= 80 && data.entityRelevanceScore >= 80 && (
              <div className="insight-item success">
                <strong>Excellent Coverage:</strong> Your content thoroughly covers the expected entities
                with good relevance scores.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntityCoverageAudit;