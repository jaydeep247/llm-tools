import React from 'react';

interface AEOScore {
  overall: number;
  ai_presence: number;
  competitor_landscape: number;
  strategy_review: number;
  structured_data?: number;
}

interface AIPlatform {
  name: string;
  icon: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
  details?: {
    understanding_level?: string;
    clarity_score?: number;
    key_topics?: string[];
    main_issues?: string[];
    recommendations?: string[];
    bot_accessibility_score?: number;
    understanding_score?: number;
    scoreType?: 'bot_accessibility' | 'ai_understanding' | 'combined';
    [key: string]: any;
  };
}

interface Competitor {
  name: string;
  count: number;
}

interface StrategyMetric {
  name: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
  color: 'green' | 'orange' | 'red';
}

interface DashboardCardsProps {
  scores: AEOScore;
  aiPlatforms: AIPlatform[];
  competitors: Competitor[];
  strategyMetrics: StrategyMetric[];
  result?: any;
  getModuleRecommendations: (moduleName: string) => string[];
  setShowRecommendations: (module: string | null) => void;
}

const DashboardCards: React.FC<DashboardCardsProps> = ({
  scores,
  aiPlatforms,
  competitors,
  strategyMetrics,
  result,
  getModuleRecommendations,
  setShowRecommendations
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#EF4444';
    return '#6B7280';
  };

  return (
    <div className="dashboard-cards">
      <div className="dashboard-card">
        <div className="card-header">
          <h3>AI Presence</h3>
          {getModuleRecommendations('ai_presence').length > 0 && (
            <button
              className="info-button"
              onClick={() => setShowRecommendations('ai_presence')}
              title={`View ${getModuleRecommendations('ai_presence').length} recommendations`}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="10" cy="7" r="0.75" fill="currentColor" />
              </svg>
              <span className="info-badge">{getModuleRecommendations('ai_presence').length}</span>
            </button>
          )}
        </div>
        <div className="card-score">
          <div
            className="score-circle-metric"
            style={{
              '--progress': scores.ai_presence,
              '--color': getScoreColor(scores.ai_presence)
            } as React.CSSProperties}
          >
            <div className="score-value-metric">{scores.ai_presence}</div>
          </div>
        </div>
        <div className="ai-platforms">
          {aiPlatforms.map((platform, index) => (
            <div key={index} className="platform-item">
              <div className="platform-icon" style={{ backgroundColor: platform.status === 'LIVE' ? '#10B981' : '#6B7280' }}>
                {platform.icon}
              </div>
              <div className="platform-info">
                <span className="platform-name">{platform.name}</span>
                <div className="platform-score">
                  <span className="score">{platform.score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-card">
        <div className="card-header">
          <h3>Competitor Landscape</h3>
          {getModuleRecommendations('competitor_analysis').length > 0 && (
            <button
              className="info-button"
              onClick={() => setShowRecommendations('competitor_analysis')}
              title={`View ${getModuleRecommendations('competitor_analysis').length} recommendations`}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="10" cy="7" r="0.75" fill="currentColor" />
              </svg>
              <span className="info-badge">{getModuleRecommendations('competitor_analysis').length}</span>
            </button>
          )}
        </div>
        <div className="card-score">
          <div
            className="score-circle-metric"
            style={{
              '--progress': scores.competitor_landscape,
              '--color': getScoreColor(scores.competitor_landscape)
            } as React.CSSProperties}
          >
            <div className="score-value-metric">{scores.competitor_landscape}</div>
          </div>
        </div>
        <div className="competitor-description">
          {result?.detailed_analysis?.competitor_analysis?.metrics ? (
            <>
              Your domain has <strong>{result.detailed_analysis.competitor_analysis.metrics.total_referring_domains || 0}</strong> referring domains
              with <strong>{result.detailed_analysis.competitor_analysis.metrics.total_individual_backlinks || 0}</strong> total backlinks.
            </>
          ) : (
            'Analyzing your backlink profile and competitive landscape.'
          )}
        </div>
        <div className="competitors-list">
          <div className="competitors-label">Top Referring Domains:</div>
          <div className="competitors-tags">
            {competitors.length > 0 && competitors[0].name !== 'No Data' && competitors[0].name !== 'Not Configured' ? (
              competitors.map((competitor, index) => (
                <span key={index} className="competitor-tag">
                  <span className="competitor-count">{competitor.count}</span> {competitor.name}
                </span>
              ))
            ) : (
              <span className="competitor-tag-empty">
                {competitors[0]?.name === 'Not Configured'
                  ? 'Configure DataForSEO API to see competitor data'
                  : 'No competitor data available'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-card">
        <div className="card-header">
          <h3>Strategy Review</h3>
          {(getModuleRecommendations('answerability').length > 0 ||
            getModuleRecommendations('knowledge_base').length > 0 ||
            getModuleRecommendations('structured_data').length > 0 ||
            getModuleRecommendations('crawler_accessibility').length > 0) && (
              <button
                className="info-button"
                onClick={() => setShowRecommendations('strategy_review')}
                title={`View ${getModuleRecommendations('answerability').length + getModuleRecommendations('knowledge_base').length + getModuleRecommendations('structured_data').length + getModuleRecommendations('crawler_accessibility').length} recommendations`}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="7" r="0.75" fill="currentColor" />
                </svg>
                <span className="info-badge">
                  {getModuleRecommendations('answerability').length +
                    getModuleRecommendations('knowledge_base').length +
                    getModuleRecommendations('structured_data').length +
                    getModuleRecommendations('crawler_accessibility').length}
                </span>
              </button>
            )}
        </div>
        <div className="card-score">
          <div
            className="score-circle-metric"
            style={{
              '--progress': scores.strategy_review,
              '--color': getScoreColor(scores.strategy_review)
            } as React.CSSProperties}
          >
            <div className="score-value-metric">{scores.strategy_review}</div>
          </div>
        </div>
        <div className="strategy-metrics">
          {strategyMetrics.map((metric, index) => (
            <div key={index} className="metric-item">
              <div className="metric-name">{metric.name}</div>
              <div className="metric-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${metric.score}%`,
                      backgroundColor: metric.color === 'green' ? '#10B981' :
                        metric.color === 'orange' ? '#F59E0B' : '#EF4444'
                    }}
                  ></div>
                </div>
                <div className="metric-score">
                  <span className="score">{metric.score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardCards;