import React from 'react';
import './AIPresenceCard.css';

interface AIPlatform {
  name: string;
  icon: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
}

interface AIPresenceCardProps {
  score: number;
  aiPlatforms: AIPlatform[];
  getScoreColor: (score: number) => string;
  onShowRecommendations: () => void;
  recommendationsCount: number;
}

export const AIPresenceCard: React.FC<AIPresenceCardProps> = ({
  score,
  aiPlatforms,
  getScoreColor,
  onShowRecommendations,
  recommendationsCount
}) => {
  return (
    <div className="dashboard-card">
      <div className="card-header">
        <h3>AI Presence</h3>
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
  );
};


export default AIPresenceCard;
