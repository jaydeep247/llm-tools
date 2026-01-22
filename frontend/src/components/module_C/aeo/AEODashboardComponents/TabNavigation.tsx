import React from 'react';

interface TabNavigationProps {
  activeView: string;
  setActiveView: (view: string) => void;
  runCrawl: boolean;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeView,
  setActiveView,
  runCrawl
}) => {
  return (
    <div className="tab-navigation bg-gray-800 border border-gray-700 rounded-lg p-1 mb-6">
      <div className="flex flex-wrap gap-2">
        {['crawler', 'data', 'links', 'tree', 'audits', 'schema', 'intelligence', 'simulator', 'page_metrics'].map(tab => (
          <button
            key={tab}
            className={`px-4 py-2 rounded text-sm font-medium transition-all ${
              activeView === tab
                ? 'bg-purple-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
            onClick={() => setActiveView(tab as any)}
          >
            {tab === 'page_metrics' ? 'Page Metrics' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
};