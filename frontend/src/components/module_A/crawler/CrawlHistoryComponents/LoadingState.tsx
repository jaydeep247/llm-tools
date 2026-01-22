import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading history...' }) => {
  return (
    <div className="crawl-history-container">
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="ml-3 text-gray-300">{message}</span>
      </div>
    </div>
  );
};