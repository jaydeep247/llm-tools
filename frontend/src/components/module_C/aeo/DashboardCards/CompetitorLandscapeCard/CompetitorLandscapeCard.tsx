import React from 'react';
import './CompetitorLandscapeCard.css';

interface Competitor {
  name: string;
  count: number;
}

interface CompetitorLandscapeCardProps {
  score: number;
  competitors: Competitor[];
  getScoreColor: (score: number) => string;
  onShowRecommendations: () => void;
  recommendationsCount: number;
  totalReferringDomains?: number;
  totalBacklinks?: number;
}

export const CompetitorLandscapeCard: React.FC<CompetitorLandscapeCardProps> = ({
  score,
  competitors,
  getScoreColor,
  onShowRecommendations,
  recommendationsCount,
  totalReferringDomains,
  totalBacklinks
}) => {
  return (
    <div className="dashboard-card">
      <div className="card-header">
        <h3>Competitor Landscape</h3>
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
      <div className="competitor-description">
        {totalReferringDomains !== undefined && totalBacklinks !== undefined ? (
          <>
            Your domain has <strong>{totalReferringDomains}</strong> referring domains
            with <strong>{totalBacklinks}</strong> total backlinks.
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
  );
};


export default CompetitorLandscapeCard;
