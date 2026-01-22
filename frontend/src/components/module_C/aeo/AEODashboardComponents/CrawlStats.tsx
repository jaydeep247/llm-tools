import React from 'react';

interface CrawlStatsProps {
  crawlStatus: string;
  pageCount: number;
  isCrawling: boolean;
  crawlStats: any;
  crawlStartTime: number | null;
  currentTime: number;
}

export const CrawlStats: React.FC<CrawlStatsProps> = ({
  crawlStatus,
  pageCount,
  isCrawling,
  crawlStats,
  crawlStartTime,
  currentTime
}) => {
  const formatDurationWithHours = (seconds: number, milliseconds: number = 0, isRunning: boolean = false): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    if (isRunning && milliseconds > 0) {
      if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(secs)}.${milliseconds}`;
      }
      return `${minutes}:${pad(secs)}.${milliseconds}`;
    }
    
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(secs)}`;
    }
    return `${minutes}:${pad(secs)}`;
  };

  const calculateLiveElapsedTime = (): { seconds: number; milliseconds: number } => {
    if (crawlStartTime) {
      const elapsedMs = currentTime - crawlStartTime;
      return {
        seconds: Math.floor(elapsedMs / 1000),
        milliseconds: Math.floor((elapsedMs % 1000) / 100)
      };
    }
    return { seconds: 0, milliseconds: 0 };
  };

  const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing';
  const elapsedTime = calculateLiveElapsedTime();

  return (
    <div className="crawl-stats bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-item">
          <div className="text-sm text-gray-400">Status</div>
          <div className={`text-xl font-bold ${
            crawlStatus === 'running' ? 'text-blue-400' :
            crawlStatus === 'auditing' ? 'text-yellow-400' :
            crawlStatus === 'completed' ? 'text-green-400' :
            'text-gray-300'
          }`}>
            {crawlStatus === 'auditing' ? 'AUDITING' : crawlStatus.toUpperCase()}
            {isActive && <span className="ml-2 inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>}
          </div>
        </div>
        
        <div className="stat-item">
          <div className="text-sm text-gray-400">Pages Discovered</div>
          <div className="text-xl font-bold text-white">{pageCount}</div>
        </div>
        
        <div className="stat-item">
          <div className="text-sm text-gray-400">
            {isActive ? '🕷️ Elapsed Time' : 'Duration'}
          </div>
          <div className={`text-xl font-bold ${isActive ? 'text-purple-400' : 'text-white'}`}>
            {isActive 
              ? formatDurationWithHours(elapsedTime.seconds, elapsedTime.milliseconds, true)
              : crawlStats?.duration 
                ? formatDurationWithHours(Math.floor(crawlStats.duration / 1000))
                : '0:00'
            }
          </div>
        </div>
      </div>
    </div>
  );
};