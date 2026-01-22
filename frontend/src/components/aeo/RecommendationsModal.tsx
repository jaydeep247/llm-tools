import React from 'react';

interface RecommendationsModalProps {
  showRecommendations: string | null;
  setShowRecommendations: (module: string | null) => void;
  getModuleRecommendations: (moduleName: string) => string[];
}

const RecommendationsModal: React.FC<RecommendationsModalProps> = ({
  showRecommendations,
  setShowRecommendations,
  getModuleRecommendations
}) => {
  if (!showRecommendations) return null;

  const getRecommendationPriority = (rec: string): 'high' | 'medium' | 'low' => {
    const recLower = rec.toLowerCase();

    const highPriorityKeywords = [
      'add title tag',
      'add meta description',
      'allow indexing',
      'robots.txt',
      'sitemap',
      'schema',
      'structured data',
      'faq section',
      'canonical',
      'organization schema',
      'website schema',
      'webpage schema'
    ];

    const mediumPriorityKeywords = [
      'improve',
      'enhance',
      'optimize',
      'add more',
      'better',
      'clear',
      'formatting',
      'alt text',
      'open graph',
      'twitter card'
    ];

    if (highPriorityKeywords.some(keyword => recLower.includes(keyword))) {
      return 'high';
    }

    if (mediumPriorityKeywords.some(keyword => recLower.includes(keyword))) {
      return 'medium';
    }

    return 'low';
  };

  return (
    <div className="recommendations-modal-overlay" onClick={() => setShowRecommendations(null)}>
      <div className="recommendations-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-title-icon">
              {showRecommendations === 'ai_presence' && '🤖'}
              {showRecommendations === 'competitor_analysis' && '🎯'}
              {showRecommendations === 'strategy_review' && '📊'}
            </div>
            <div className="modal-title-section">
              <h3>
                {showRecommendations === 'ai_presence' && 'AI Presence Recommendations'}
                {showRecommendations === 'competitor_analysis' && 'Competitor Analysis Recommendations'}
                {showRecommendations === 'strategy_review' && 'Strategy Review Recommendations'}
              </h3>
              <p className="modal-subtitle">
                {showRecommendations === 'ai_presence' && 'Improve your AI visibility and presence'}
                {showRecommendations === 'competitor_analysis' && 'Enhance your competitive positioning'}
                {showRecommendations === 'strategy_review' && 'Optimize your overall strategy'}
              </p>
            </div>
          </div>
          <button
            className="close-button"
            onClick={() => setShowRecommendations(null)}
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="modal-content">
          {showRecommendations === 'strategy_review' ? (
            <div className="strategy-recommendations">
              {getModuleRecommendations('answerability').length > 0 && (
                <div className="module-section">
                  <div className="module-section-header">
                    <span className="module-icon">❓</span>
                    <h4>Answerability</h4>
                  </div>
                  <div className="recommendations-list">
                    {getModuleRecommendations('answerability').map((rec, index) => {
                      const priority = getRecommendationPriority(rec);
                      return (
                        <div key={index} className={`recommendation-item priority-${priority}`}>
                          <div className="recommendation-icon-wrapper">
                            <div className="recommendation-icon">💡</div>
                          </div>
                          <div className="recommendation-content">
                            <div className="recommendation-header">
                              <span className={`priority-badge priority-${priority}`}>
                                {priority.toUpperCase()}
                              </span>
                              <span className="recommendation-priority-label">
                                {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                              </span>
                            </div>
                            <div className="recommendation-text">{rec}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {getModuleRecommendations('knowledge_base').length > 0 && (
                <div className="module-section">
                  <div className="module-section-header">
                    <span className="module-icon">📚</span>
                    <h4>Knowledge Base</h4>
                  </div>
                  <div className="recommendations-list">
                    {getModuleRecommendations('knowledge_base').map((rec, index) => {
                      const priority = getRecommendationPriority(rec);
                      return (
                        <div key={index} className={`recommendation-item priority-${priority}`}>
                          <div className="recommendation-icon-wrapper">
                            <div className="recommendation-icon">💡</div>
                          </div>
                          <div className="recommendation-content">
                            <div className="recommendation-header">
                              <span className={`priority-badge priority-${priority}`}>
                                {priority.toUpperCase()}
                              </span>
                              <span className="recommendation-priority-label">
                                {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                              </span>
                            </div>
                            <div className="recommendation-text">{rec}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {getModuleRecommendations('structured_data').length > 0 && (
                <div className="module-section">
                  <div className="module-section-header">
                    <span className="module-icon">🔧</span>
                    <h4>Structured Data</h4>
                  </div>
                  <div className="recommendations-list">
                    {getModuleRecommendations('structured_data').map((rec, index) => {
                      const priority = getRecommendationPriority(rec);
                      return (
                        <div key={index} className={`recommendation-item priority-${priority}`}>
                          <div className="recommendation-icon-wrapper">
                            <div className="recommendation-icon">💡</div>
                          </div>
                          <div className="recommendation-content">
                            <div className="recommendation-header">
                              <span className={`priority-badge priority-${priority}`}>
                                {priority.toUpperCase()}
                              </span>
                              <span className="recommendation-priority-label">
                                {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                              </span>
                            </div>
                            <div className="recommendation-text">{rec}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {getModuleRecommendations('crawler_accessibility').length > 0 && (
                <div className="module-section">
                  <div className="module-section-header">
                    <span className="module-icon">🕷️</span>
                    <h4>Crawler Accessibility</h4>
                  </div>
                  <div className="recommendations-list">
                    {getModuleRecommendations('crawler_accessibility').map((rec, index) => {
                      const priority = getRecommendationPriority(rec);
                      return (
                        <div key={index} className={`recommendation-item priority-${priority}`}>
                          <div className="recommendation-icon-wrapper">
                            <div className="recommendation-icon">💡</div>
                          </div>
                          <div className="recommendation-content">
                            <div className="recommendation-header">
                              <span className={`priority-badge priority-${priority}`}>
                                {priority.toUpperCase()}
                              </span>
                              <span className="recommendation-priority-label">
                                {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                              </span>
                            </div>
                            <div className="recommendation-text">{rec}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {(() => {
                const moduleName = showRecommendations === 'ai_presence' ? 'AI Presence' :
                  showRecommendations === 'competitor_analysis' ? 'Competitor Analysis' : '';
                const moduleIcon = showRecommendations === 'ai_presence' ? '🤖' :
                  showRecommendations === 'competitor_analysis' ? '🎯' : '';
                const recommendations = getModuleRecommendations(showRecommendations);

                if (recommendations.length === 0) {
                  return (
                    <div className="no-recommendations">
                      <div className="no-recommendations-icon">📝</div>
                      <div className="no-recommendations-text">
                        No recommendations available for this module.
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="module-section">
                    {moduleName && (
                      <div className="module-section-header">
                        <span className="module-icon">{moduleIcon}</span>
                        <h4>{moduleName}</h4>
                      </div>
                    )}
                    <div className="recommendations-list">
                      {recommendations.map((rec, index) => {
                        const priority = getRecommendationPriority(rec);
                        return (
                          <div key={index} className={`recommendation-item priority-${priority}`}>
                            <div className="recommendation-icon-wrapper">
                              <div className="recommendation-icon">💡</div>
                            </div>
                            <div className="recommendation-content">
                              <div className="recommendation-header">
                                <span className={`priority-badge priority-${priority}`}>
                                  {priority.toUpperCase()}
                                </span>
                                <span className="recommendation-priority-label">
                                  {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                                </span>
                              </div>
                              <div className="recommendation-text">{rec}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecommendationsModal;