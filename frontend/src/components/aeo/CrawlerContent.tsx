import React from 'react';

interface CrawlerContentProps {
  isCrawling: boolean;
  crawlStatus: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled';
  pageCount: number;
  crawlStats: {
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null;
  logs: { message: string; timestamp: string }[];
  discoveredPages: any[];
  crawlStartTime: number | null;
  currentTime: number;
}

const CrawlerContent: React.FC<CrawlerContentProps> = ({
  isCrawling,
  crawlStatus,
  pageCount,
  crawlStats,
  logs,
  discoveredPages,
  crawlStartTime,
  currentTime
}) => {
  // Helper function to format duration as watch time (HH:MM:SS or MM:SS) with optional milliseconds
  const formatDurationWithHours = (seconds: number, milliseconds: number = 0, isRunning: boolean = false): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    // Format as watch time: HH:MM:SS or MM:SS
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    // For running sessions, show milliseconds (tenths of a second)
    if (isRunning && milliseconds > 0) {
      if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(secs)}.${milliseconds}`;
      }
      return `${minutes}:${pad(secs)}.${milliseconds}`;
    }
    
    // For completed sessions, standard format
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(secs)}`;
    }
    return `${minutes}:${pad(secs)}`;
  };

  // Calculate elapsed time for live timer with milliseconds
  const calculateElapsedTime = (): { seconds: number; milliseconds: number } => {
    const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing';
    
    if (isActive && crawlStartTime) {
      // Calculate live elapsed time with milliseconds
      const elapsedMs = currentTime - crawlStartTime;
      return {
        seconds: Math.floor(elapsedMs / 1000),
        milliseconds: Math.floor((elapsedMs % 1000) / 100) // Get tenths of a second
      };
    }
    
    // For completed sessions, use stored duration from crawlStats
    if (crawlStats?.duration) {
      return { seconds: Math.floor(crawlStats.duration), milliseconds: 0 };
    }
    
    return { seconds: 0, milliseconds: 0 };
  };

  return (
    <div className="crawler-content">
      <div className="crawler-status">
        <div className="status-header">
          <h3>🕷️ Crawling Status</h3>
          <div className="status-indicator">
            <div className={`status-dot ${(isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing') ? 'active' : ''}`}></div>
            <span>
              {crawlStatus === 'running' ? 'Crawling...' :
                crawlStatus === 'auditing' ? 'Auditing...' :
                crawlStatus === 'completed' ? 'Completed' :
                  'Idle'}
            </span>
          </div>
        </div>
        <div className="crawler-stats">
          <div className="stat-box">
            <div className="stat-value">{pageCount}</div>
            <div className="stat-label">Pages Discovered</div>
          </div>
          {(crawlStats || isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing') && (
            <>
              <div className="stat-box">
                <div className="stat-value" style={{ 
                  color: (isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing') ? '#a78bfa' : undefined 
                }}>
                  {(() => {
                    const elapsedTime = calculateElapsedTime();
                    const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing';
                    return formatDurationWithHours(elapsedTime.seconds, elapsedTime.milliseconds, isActive);
                  })()}
                  {(isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing') && (
                    <span style={{ marginLeft: '4px', display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#a78bfa', borderRadius: '50%', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></span>
                  )}
                </div>
                <div className="stat-label">
                  {(isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing') ? '🕷️ Elapsed Time' : 'Duration'}
                </div>
              </div>
              {crawlStats && (
                <div className="stat-box">
                  <div className="stat-value">{crawlStats.pagesPerSecond.toFixed(1)}</div>
                  <div className="stat-label">Items/Sec</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="crawler-panels">
        <div className="crawler-panel">
          <h4>📝 Live Logs</h4>
          <div className="logs-container">
            {logs.length === 0 ? (
              <div className="empty-logs">
                {isCrawling ? 'Crawling in progress...' : 'Waiting for crawl to start...'}
              </div>
            ) : (
              logs.slice(-50).reverse().map((log, idx) => (
                <div key={idx} className="log-entry">
                  <span className="log-time">{log.timestamp}</span>
                  <span className="log-text">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="crawler-panel">
          <h4>📄 Discovered Pages</h4>
          <div className="pages-container">
            {discoveredPages.length === 0 ? (
              <div className="empty-pages">
                No pages discovered yet...
              </div>
            ) : (
              discoveredPages.slice().reverse().map((page, idx) => (
                <div key={idx} className="page-entry">
                  <a
                    href={page.url || page}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="page-url"
                  >
                    {page.url || page}
                  </a>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CrawlerContent;