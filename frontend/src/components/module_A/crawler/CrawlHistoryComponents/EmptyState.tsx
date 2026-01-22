import React from 'react';

export const EmptyState: React.FC = () => {
  return (
    <div className="crawl-history-container">
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🕷️</div>
        <h3 className="text-xl font-semibold text-gray-300 mb-2">No Crawl History Yet</h3>
        <p className="text-gray-400">
          Your crawl history will appear here once you start analyzing websites.
        </p>
      </div>
    </div>
  );
};