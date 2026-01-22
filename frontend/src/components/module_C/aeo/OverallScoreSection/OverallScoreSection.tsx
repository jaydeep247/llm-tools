import React from 'react';
import './OverallScoreSection.css';

interface OverallScoreSectionProps {
  overallScore: number;
  analysisTimestamp?: string;
  getScoreText: (score: number) => string;
}

export const OverallScoreSection: React.FC<OverallScoreSectionProps> = ({
  overallScore,
  analysisTimestamp,
  getScoreText
}) => {
  return (
    <div className="overall-section">
      <div className="overall-score">
        <div
          className="score-circle"
          style={{ '--progress': overallScore } as React.CSSProperties}
        >
          <div className="score-value">{overallScore}</div>
          <div className="score-total">/100</div>
        </div>
      </div>
      <div className="report-summary">
        <div className="summary-date">
          {analysisTimestamp
            ? new Date(analysisTimestamp).toLocaleDateString('en-GB')
            : new Date().toLocaleDateString('en-GB')}
        </div>
        <div className="summary-text">{getScoreText(overallScore)}</div>
      </div>
    </div>
  );
};

export default OverallScoreSection;
