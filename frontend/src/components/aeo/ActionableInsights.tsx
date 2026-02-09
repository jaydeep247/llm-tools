import React, { useState, useEffect } from 'react';
import { 
  useGetActionableInsightsQuery,
  useAnalyzePageActionsMutation
} from '../../store/api/module_C/actionableInsightsApi';
import '../../pages/AEODashboard.css';

interface ImprovementAction {
  id: string;
  type: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  impact: number;
  effort: 'Easy' | 'Moderate' | 'Complex';
  category: string;
}

interface ActionableInsightsData {
  totalActions: number;
  priorityBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
  currentScore: number;
  predictedScore: number;
  improvement: number;
  actions: ImprovementAction[];
}

interface ActionableInsightsProps {
  url?: string;
  content?: string;
  sessionId?: number;
}

const ActionableInsights: React.FC<ActionableInsightsProps> = ({
  url,
  content,
  sessionId
}) => {
  const [localData, setLocalData] = useState<ActionableInsightsData | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<string>('All');
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  const { data: insightsData, isLoading: insightsLoading } = useGetActionableInsightsQuery();
  const [analyzePageActions, { data: analysisData, isLoading: analysisLoading, error: analysisError }] = useAnalyzePageActionsMutation();

  // Auto-analyze content on mount if content is provided
  useEffect(() => {
    const shouldAnalyze = !localData && !hasAnalyzed && !analysisLoading && (content || url);

    if (shouldAnalyze) {
      console.log('Starting actionable insights analysis');
      
      analyzePageActions({
        url,
        content,
        sessionId
      }).unwrap()
        .then((response) => {
          console.log('Actionable insights analysis successful:', response);
          setHasAnalyzed(true);
          if (response.success && response.data) {
            setLocalData(response.data);
          }
        })
        .catch((error) => {
          console.error('Actionable insights analysis failed:', error);
          setHasAnalyzed(true);
        });
    }
  }, [content, url, localData, hasAnalyzed, analysisLoading, analyzePageActions, sessionId]);

  // Update local data when analysis completes
  useEffect(() => {
    if (analysisData?.success && analysisData.data) {
      setLocalData(analysisData.data);
    }
  }, [analysisData]);

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'High': return '#EF4444';
      case 'Medium': return '#F59E0B';
      case 'Low': return '#10B981';
      default: return '#6B7280';
    }
  };

  const getPriorityIcon = (priority: string): string => {
    switch (priority) {
      case 'High': return '🔴';
      case 'Medium': return '🟠';
      case 'Low': return '🟢';
      default: return '⚪';
    }
  };

  const getEffortColor = (effort: string): string => {
    switch (effort) {
      case 'Easy': return '#10B981';
      case 'Moderate': return '#F59E0B';
      case 'Complex': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const toggleActionExpansion = (actionId: string) => {
    const newExpanded = new Set(expandedActions);
    if (newExpanded.has(actionId)) {
      newExpanded.delete(actionId);
    } else {
      newExpanded.add(actionId);
    }
    setExpandedActions(newExpanded);
  };

  const filteredActions = localData?.actions?.filter(action => 
    selectedPriority === 'All' || action.priority === selectedPriority
  ) || [];

  // Error state
  if (analysisError) {
    return (
      <div className="content-metrics-container">
        <div className="content-metrics-header">
          <h2>🎯 Actionable Insights - Page-Level Improvements</h2>
          <p className="subtitle">Specific actions to improve your page's LLM performance...</p>
        </div>
        <div className="no-data-message">
          <div style={{ color: '#EF4444', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
              Error Loading Actionable Insights
            </p>
            <p style={{ marginBottom: '16px' }}>
              Please check your content and try again.
            </p>
            <button
              onClick={() => {
                setHasAnalyzed(false);
                setLocalData(null);
              }}
              style={{
                padding: '10px 20px',
                cursor: 'pointer',
                backgroundColor: '#7C3AED',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Retry Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (analysisLoading || (insightsLoading && !localData)) {
    return (
      <div className="content-metrics-container">
        <div className="content-metrics-header">
          <h2>🎯 Actionable Insights - Page-Level Improvements</h2>
          <p className="subtitle">Analyzing your page to identify specific improvement opportunities...</p>
        </div>
        <div className="no-data-message">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
            <div style={{ fontSize: '24px', animation: 'spin 1s linear infinite' }}>⚙️</div>
            <p>Analyzing page structure and content for actionable improvements...</p>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (!localData) {
    return (
      <div className="content-metrics-container">
        <div className="content-metrics-header">
          <h2>🎯 Actionable Insights - Page-Level Improvements</h2>
          <p className="subtitle">Get specific recommendations to improve your page's LLM performance...</p>
        </div>
        <div className="no-data-message">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <p style={{ fontSize: '16px', marginBottom: '16px' }}>
              {url || content ? 'Preparing to analyze your page for improvements...' : 'Please provide a URL or content to analyze.'}
            </p>
            <p style={{ fontSize: '14px', color: '#9CA3AF', textAlign: 'center' }}>
              We'll identify specific actions you can take to improve LLM performance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { totalActions, priorityBreakdown, currentScore, predictedScore, improvement, actions } = localData;

  return (
    <div className="content-metrics-container">
      <div className="content-metrics-header">
        <h2>🎯 Actionable Insights - Page-Level Improvements</h2>
        <p className="subtitle">
          Specific recommendations to improve your page's LLM-friendliness score
        </p>
      </div>

      {/* Score Improvement Overview */}
      <div className="entity-types-section">
        <div className="section-header">
          <h3>📈 Improvement Potential</h3>
          <p className="subtitle">Predicted score improvement after implementing recommendations</p>
        </div>

        <div className="entity-types-grid">
          {/* Current Score */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>📊</div>
              <div className="entity-type-info">
                <h4>Current LLM Score</h4>
                <p className="entity-count">{currentScore}/100</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: currentScore >= 80 ? '#10B981' : currentScore >= 60 ? '#F59E0B' : '#EF4444',
                  width: `${currentScore}%`
                }}
              />
            </div>
          </div>

          {/* Predicted Score */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>🎯</div>
              <div className="entity-type-info">
                <h4>Predicted Score</h4>
                <p className="entity-count">{predictedScore}/100</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: predictedScore >= 80 ? '#10B981' : predictedScore >= 60 ? '#F59E0B' : '#EF4444',
                  width: `${predictedScore}%`
                }}
              />
            </div>
          </div>

          {/* Improvement */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>⬆️</div>
              <div className="entity-type-info">
                <h4>Potential Gain</h4>
                <p className="entity-count">+{improvement} points</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: '#7C3AED',
                  width: `${Math.min(100, (improvement / 30) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Total Actions */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>📋</div>
              <div className="entity-type-info">
                <h4>Total Actions</h4>
                <p className="entity-count">{totalActions} recommendations</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: '#3B82F6',
                  width: `${Math.min(100, (totalActions / 20) * 100)}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Priority Breakdown */}
      <div className="entity-types-section">
        <div className="section-header">
          <h3>🏆 Action Priority Breakdown</h3>
          <p className="subtitle">Recommendations organized by impact and urgency</p>
        </div>

        <div className="entity-types-grid">
          {/* High Priority */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>🔴</div>
              <div className="entity-type-info">
                <h4>High Priority</h4>
                <p className="entity-count">{priorityBreakdown.high} actions</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: '#EF4444',
                  width: `${Math.min(100, (priorityBreakdown.high / 10) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Medium Priority */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>🟠</div>
              <div className="entity-type-info">
                <h4>Medium Priority</h4>
                <p className="entity-count">{priorityBreakdown.medium} actions</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: '#F59E0B',
                  width: `${Math.min(100, (priorityBreakdown.medium / 10) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Low Priority */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>🟢</div>
              <div className="entity-type-info">
                <h4>Low Priority</h4>
                <p className="entity-count">{priorityBreakdown.low} actions</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: '#10B981',
                  width: `${Math.min(100, (priorityBreakdown.low / 10) * 100)}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Items List */}
      <div className="entity-types-section">
        <div className="section-header">
          <h3>📝 Recommended Actions</h3>
          <p className="subtitle">Specific steps to improve your page's LLM performance</p>
        </div>

        {/* Filter Controls */}
        <div style={{ marginBottom: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['All', 'High', 'Medium', 'Low'].map((priority) => (
            <button
              key={priority}
              onClick={() => setSelectedPriority(priority)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: '500',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: selectedPriority === priority ? '#7C3AED' : '#374151',
                color: '#FFFFFF',
                transition: 'background-color 0.2s'
              }}
            >
              {priority === 'All' ? `All (${totalActions})` : `${priority} (${priorityBreakdown[priority.toLowerCase() as keyof typeof priorityBreakdown]})`}
            </button>
          ))}
        </div>

        {/* Actions List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredActions.map((action) => (
            <div
              key={action.id}
              style={{
                backgroundColor: '#111827',
                border: '1px solid #374151',
                borderLeft: `4px solid ${getPriorityColor(action.priority)}`,
                borderRadius: '8px',
                padding: '16px',
                transition: 'border-color 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '16px' }}>{getPriorityIcon(action.priority)}</span>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#F3F4F6' }}>
                      {action.type}
                    </h4>
                    <span style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      backgroundColor: getPriorityColor(action.priority),
                      color: 'white',
                      fontWeight: '600'
                    }}>
                      {action.priority}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#D1D5DB', lineHeight: '1.4' }}>
                    {action.description}
                  </p>
                </div>
                <button
                  onClick={() => toggleActionExpansion(action.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9CA3AF',
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '4px',
                    marginLeft: '12px'
                  }}
                >
                  {expandedActions.has(action.id) ? 'x' : '+'}
                </button>
              </div>

              {expandedActions.has(action.id) && (
                <div style={{ paddingTop: '12px', borderTop: '1px solid #374151' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '500' }}>Impact Score</span>
                      <div style={{ fontSize: '14px', color: '#F3F4F6', fontWeight: '600' }}>
                        +{action.impact} points
                      </div>
                    </div>
                    {/* <div>
                      <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '500' }}>Effort Level</span>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: getEffortColor(action.effort),
                        backgroundColor: getEffortColor(action.effort) === '#10B981' ? '#064E3B' :
                          getEffortColor(action.effort) === '#F59E0B' ? '#78350F' : '#7F1D1D',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        {action.effort}
                      </div>
                    </div> */}
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '500' }}>Category</span>
                    <div style={{ fontSize: '13px', color: '#D1D5DB', fontWeight: '500' }}>
                      {action.category}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredActions.length === 0 && (
          <div style={{
            padding: '32px 20px',
            textAlign: 'center',
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#9CA3AF'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '500' }}>
              No {selectedPriority.toLowerCase()} priority actions found
            </p>
            <p style={{ margin: 0, fontSize: '13px', opacity: 0.7 }}>
              {selectedPriority === 'All' 
                ? 'Your page is already well-optimized for LLM performance!'
                : `Try selecting a different priority level to see more recommendations.`
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionableInsights;