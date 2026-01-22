import React from 'react';
import './ErrorDisplay.css';

interface ErrorDisplayProps {
  error: string | null;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
  if (!error) return null;

  const isLimitError = error.toLowerCase().includes('limit') || error.toLowerCase().includes('exceeded');

  return (
    <div className="error-display-container">
      <div className="error-display">
        <div className="error-icon">⚠️</div>
        <div className="error-content">
          <h3 className="error-title">
            {isLimitError ? '🚫 Daily Limit Reached' : 'Analysis Failed'}
          </h3>
          <p className="error-message">{error}</p>
        </div>
      </div>
    </div>
  );
};
