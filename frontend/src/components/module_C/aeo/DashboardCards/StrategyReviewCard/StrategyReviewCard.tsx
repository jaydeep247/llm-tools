import React from 'react';
import './StrategyReviewCard.css';

interface StrategyMetric {
  name: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
  color: 'green' | 'orange' | 'red';
}

interface StrategyReviewCardProps {
  score: number;
  strategyMetrics: StrategyMetric[];
  getScoreColor: (score: number) => string;
  onShowRecommendations: () => void;
  recommendationsCount: number;
}

export const StrategyReviewCard: React.FC<StrategyReviewCardProps> = ({
  score,
  strategyMetrics,
  getScoreColor,
  onShowRecommendations,
  recommendationsCount
}) => {
  return (
    <div className="dashboard-card">
      <div className="card-header">
        <h3>Strategy Review</h3>
        {recommendationsCount > 0 && (
          <button
            className="info-button"
            onClick={onShowRecommendations}
            title={`View ${recommendationsCount} recommendations`}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="7" r="0.75" fill="currentColor" />
            </svg>
            <span className="info-badge">{recommendationsCount}</span>
          </button>
        )}
      </div>
      <div className="card-score">
        <div
          className="score-circle-metric"
          style={{
            '--progress': score,
            '--color': getScoreColor(score)
          } as React.CSSProperties}
        >
          <div className="score-value-metric">{score}</div>
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
  );
};


export default StrategyReviewCard;
