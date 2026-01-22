import React from 'react';

interface AEOScore {
  overall: number;
  ai_presence: number;
  competitor_landscape: number;
  strategy_review: number;
  structured_data?: number;
}

interface OverallScoreSectionProps {
  scores: AEOScore;
  result?: any;
}

const OverallScoreSection: React.FC<OverallScoreSectionProps> = ({ scores, result }) => {
  const getScoreText = (score: number) => {
    if (score >= 90) return 'Exceptional! Your Company\'s AEO report obtained an outstanding score. Your company has mastered AI visibility strategies and is prominently featured in AI responses. Our suggestions will help maintain this exceptional performance.';
    if (score >= 70) return 'Good performance! Your AEO score shows strong AI visibility. There are opportunities to optimize further and improve your presence in AI responses.';
    if (score >= 50) return 'Moderate performance. Your AEO score indicates room for improvement in AI visibility strategies.';
    return 'Your AEO score needs attention. Focus on improving AI visibility and structured data implementation.';
  };

  return (
    <div className="overall-section">
      <div className="overall-score">
        <div
          className="score-circle"
          style={{ '--progress': scores.overall } as React.CSSProperties}
        >
          <div className="score-value">{scores.overall}</div>
          <div className="score-total">/100</div>
        </div>
      </div>
      <div className="report-summary">
        <div className="summary-date">
          {result?.analysis_timestamp
            ? new Date(result.analysis_timestamp).toLocaleDateString('en-GB')
            : new Date().toLocaleDateString('en-GB')}
        </div>
        <div className="summary-text">{getScoreText(scores.overall)}</div>
      </div>
    </div>
  );
};

export default OverallScoreSection;