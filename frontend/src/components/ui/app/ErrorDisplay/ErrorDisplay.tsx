import React from 'react';
import './ErrorDisplay.css';

interface ErrorDisplayProps {
  error: string | null;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
  if (!error) return null;

  const isLimitError = error.toLowerCase().includes('limit') || error.toLowerCase().includes('exceeded');
  const isAuthError = error.toLowerCase().includes('login') || error.toLowerCase().includes('authenticated') || error.toLowerCase().includes('token');

  const title = isLimitError
    ? 'Daily limit reached'
    : isAuthError
      ? 'Authentication required'
      : 'Something went wrong';

  return (
    <div className="error-display-container">
      <div className="error-display">
        <div className="error-icon">⚠️</div>
        <div className="error-content">
          <h3 className="error-title">{title}</h3>
          <p className="error-message">{error}</p>
        </div>
      </div>
    </div>
  );
};
