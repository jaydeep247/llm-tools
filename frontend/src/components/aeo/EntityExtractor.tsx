import React, { useState } from 'react';
import '../../pages/AEODashboard.css';

interface EntityData {
  text: string;
  type: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

interface EntityMetrics {
  totalEntitiesDetected: number;
  entityTypes: {
    Person: number;
    Product: number;
    Location: number;
    Concept: number;
  };
  missingExpectedEntities: string[];
  extractedEntities: EntityData[];
  overallScore: number;
}

interface EntityExtractorProps {
  entityData?: EntityMetrics;
}

const EntityExtractor: React.FC<EntityExtractorProps> = ({ entityData }) => {
  const [showAllEntities, setShowAllEntities] = useState(false);

  // Use passed entityData if available, otherwise use demo data
  const displayData = entityData;
  
  // Define entity type order for sorting
  const entityTypeOrder = ['Location', 'Concept', 'Product', 'Person'];
  
  // Sort extracted entities by the custom order and filter for unique entities
  const sortedExtractedEntities = displayData?.extractedEntities
    ? (() => {
        // First, remove duplicates based on entity text (case insensitive)
        const uniqueEntities = displayData.extractedEntities.reduce((acc, entity) => {
          const lowerText = entity.text.toLowerCase();
          const existingEntity = acc.find(e => e.text.toLowerCase() === lowerText);
          
          if (!existingEntity) {
            // Add new unique entity
            acc.push(entity);
          } else if (entity.confidence > existingEntity.confidence) {
            // Replace with higher confidence version of the same entity
            const index = acc.indexOf(existingEntity);
            acc[index] = entity;
          }
          
          return acc;
        }, [] as typeof displayData.extractedEntities);
        
        // Then sort by custom order
        return uniqueEntities.sort((a, b) => {
          const aIndex = entityTypeOrder.indexOf(a.type);
          const bIndex = entityTypeOrder.indexOf(b.type);
          return aIndex - bIndex;
        });
      })()
    : [];
  
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

  const getEntityTypeIcon = (type: string) => {
    switch (type) {
      case 'Person': return '👤';
      case 'Location': return '📍';
      case 'Concept': return '💡';
      case 'Product': return '📦';
      default: return '🔖';
    }
  };

  const getEntityTypeColor = (type: string) => {
    switch (type) {
      case 'Person': return '#3B82F6';
      case 'Location': return '#F59E0B';
      case 'Concept': return '#8B5CF6';
      case 'Product': return '#10B981';
      default: return '#6B7280';
    }
  };

  if (!displayData) {
    return (
      <div className="content-metrics-container">
        <div className="content-metrics-header">
          <h2>Entity Extractor - "What LLMs See"</h2>
          <p className="subtitle">Analyzing website content to extract entities...</p>
        </div>
        <div className="no-data-message">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{ fontSize: '24px', animation: 'spin 1s linear infinite' }}>🔄</div>
            <p>Extracting entities from website content... This may take a few moments.</p>
          </div>
        </div>
      </div>
    );
  }

  const { totalEntitiesDetected, entityTypes, missingExpectedEntities, overallScore } = displayData;

  return (
    <div className="content-metrics-container">
      <div className="content-metrics-header">
        <h2>Entity Extractor - "What LLMs See"</h2>
        <p className="subtitle">Analysis of entities detected in your content and what AI models can identify</p>
      </div>

      {/* Primary Metrics Grid */}
      <div className="content-metrics-grid">
        {/* Overall Score */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">🎯</div>
            <div>
              <h3>Entity Detection Score</h3>
              <p className="metric-description">Overall entity extraction effectiveness (0-100)</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div
                className="score-circle-large"
                style={{
                  '--progress': overallScore,
                  '--color': getScoreColor(overallScore)
                } as React.CSSProperties}
              >
                <div className="score-value-large">{overallScore}</div>
              </div>
            </div>
            <div className="metric-info">
              <div className="score-label-display">
                {getScoreLabel(overallScore)}
              </div>
            </div>
          </div>
        </div>

        {/* Total Entities Detected */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">🔍</div>
            <div>
              <h3>Total Entities</h3>
              <p className="metric-description">Number of entities detected</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div className="score-value-large text-blue-600">{totalEntitiesDetected}</div>
            </div>
            <div className="metric-info">
              <div className="score-label-display">
                entities found
              </div>
            </div>
          </div>
        </div>

        {/* Missing Entities */}
        <div className="content-metric-card">
          <div className="metric-card-header">
            <div className="metric-icon-large">❌</div>
            <div>
              <h3>Missing Entities</h3>
              <p className="metric-description">Expected entities not found</p>
            </div>
          </div>
          <div className="metric-card-body">
            <div className="metric-score-display">
              <div className="score-value-large text-red-600">{missingExpectedEntities.length}</div>
            </div>
            <div className="metric-info">
              <div className="score-label-display">
                entities missing
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Entity Types Breakdown */}
      <div className="entity-types-section">
        <div className="section-header">
          <h3>Entity Types Distribution</h3>
          <p className="subtitle">Breakdown of detected entity categories</p>
        </div>
        
        <div className="entity-types-grid">
          {['Location', 'Concept', 'Product', 'Person'].map((type) => {
            const count = entityTypes[type as keyof typeof entityTypes] || 0;
            return (
              <div key={type} className="entity-type-card">
                <div className="entity-type-header">
                  <div 
                    className="entity-type-icon"
                    style={{ backgroundColor: getEntityTypeColor(type) }}
                  >
                    {getEntityTypeIcon(type)}
                  </div>
                  <div className="entity-type-info">
                    <h4>{type}</h4>
                    <p className="entity-count">{count} entities</p>
                  </div>
                </div>
                <div className="entity-type-progress">
                  <div 
                    className="entity-progress-bar"
                    style={{
                      backgroundColor: getEntityTypeColor(type),
                      width: `${Math.min((count / Math.max(totalEntitiesDetected, 1)) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Extracted Entities */}
      {sortedExtractedEntities.length > 0 && (
        <div className="extracted-entities-section">
          <div className="section-header">
            <h3>Extracted Entities</h3>
            <p className="subtitle">Top entities detected in your content</p>
          </div>
          
          <div className="entities-grid">
            {(showAllEntities ? sortedExtractedEntities : sortedExtractedEntities.slice(0, 12)).map((entity, index) => (
              <div key={index} className="entity-badge">
                <div className="entity-badge-content">
                  <span className="entity-icon">{getEntityTypeIcon(entity.type)}</span>
                  <span className="entity-text">{entity.text}</span>
                  <span 
                    className="entity-type-label"
                    style={{ backgroundColor: getEntityTypeColor(entity.type) }}
                  >
                    {entity.type}
                  </span>
                </div>
                <div className="entity-confidence">
                  {Math.round(entity.confidence * 100)}% confidence
                </div>
              </div>
            ))}
          </div>
          
          {sortedExtractedEntities.length > 12 && (
            <div className="entities-more">
              <button 
                className="show-more-button"
                onClick={() => setShowAllEntities(!showAllEntities)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6B7280',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  fontSize: '14px',
                  textDecoration: 'underline',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#F3F4F6'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
              >
                {showAllEntities 
                  ? '← Show less' 
                  : `+${sortedExtractedEntities.length - 12} more entities detected (click to expand)`
                }
              </button>
            </div>
          )}
        </div>
      )}

      {/* Missing Entities */}
      {missingExpectedEntities.length > 0 && (
        <div className="missing-entities-section">
          <div className="section-header">
            <h3>Missing Expected Entities</h3>
            <p className="subtitle">Entities that were expected but not found in your content</p>
          </div>
          
          <div className="missing-entities-grid">
            {missingExpectedEntities.map((entity, index) => (
              <div key={index} className="missing-entity-badge">
                <span className="missing-entity-icon">❌</span>
                <span className="missing-entity-text">{entity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights and Recommendations */}
      <div className="entity-insights-section">
        <div className="section-header">
          <h3>Entity Analysis Insights</h3>
          <p className="subtitle">Key insights about your content's entity visibility to AI models</p>
        </div>
        
        <div className="insights-grid">
          <div className="insight-card">
            <h4>🤖 AI Model Visibility</h4>
            <p>
              Your content contains <strong>{totalEntitiesDetected}</strong> identifiable entities. 
              AI models can easily extract and understand these key concepts from your content.
            </p>
          </div>
          
          <div className="insight-card">
            <h4>📊 Entity Diversity</h4>
            <p>
              {Object.values(entityTypes).filter(count => count > 0).length} out of 4 entity types detected. 
              Higher diversity helps AI models better understand content context and topic coverage.
            </p>
          </div>
          
          <div className="insight-card">
            <h4>🎯 Content Optimization</h4>
            <p>
              {overallScore >= 80 
                ? "Excellent entity coverage! Your content is well-optimized for AI understanding."
                : overallScore >= 60
                ? "Good entity presence. Consider adding more specific entities for better AI comprehension."
                : "Entity coverage could be improved. Add more specific names, products, and concepts."
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntityExtractor;