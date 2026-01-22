import React from 'react';

interface ErrorStateProps {
  error: string;
  onRetry: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ error, onRetry }) => {
  return (
    <div className="crawl-history-container">
      <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-4">
        <p className="text-red-200">Error: {error}</p>
        <button
          onClick={onRetry}
          className="mt-2 px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-white text-sm"
        >
          Retry
        </button>
      </div>
    </div>
  );
};