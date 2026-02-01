import React from 'react';
import { CrawlHistoryItem } from '../types';

interface CrawlHistoryCardProps {
  item: CrawlHistoryItem;
  onSelectCrawl: (url: string, sessionId: number, aeoResult: any) => void;
  onDeleteSession: (e: React.MouseEvent, sessionId: number) => void;
  deletingSessionId: number | null;
  currentTime: number;
}

export const CrawlHistoryCard: React.FC<CrawlHistoryCardProps> = ({
  item,
  onSelectCrawl,
  onDeleteSession,
  deletingSessionId,
  currentTime
}) => {
  const session = item.session || (item as any);
  const aeoResult = item.aeoResult || ((item as any).aeo_grade ? { overallScore: 0, grade: (item as any).aeo_grade, gradeColor: '#ccc', analysisTimestamp: '' } : null);
  const isReused = item.isReused || false;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDurationWithHours = (seconds: number, milliseconds: number = 0, isRunning: boolean = false) => {
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

  const calculateElapsedTime = (startedAt: string | undefined, status: string, storedDuration: number): { seconds: number; milliseconds: number } => {
    if ((status === 'running' || status === 'auditing') && startedAt) {
      const startTime = new Date(startedAt).getTime();
      const elapsedMs = currentTime - startTime;
      return {
        seconds: Math.floor(elapsedMs / 1000),
        milliseconds: Math.floor((elapsedMs % 1000) / 100)
      };
    }
    return { seconds: storedDuration, milliseconds: 0 };
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      running: 'bg-blue-500',
      completed: 'bg-green-500',
      failed: 'bg-red-500',
      auditing: 'bg-yellow-500',
      cancelled: 'bg-orange-500'
    };
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors[status as keyof typeof colors] || 'bg-gray-500'} text-white`}>
        {status === 'auditing' ? 'AUDITING' : status.toUpperCase()}
      </span>
    );
  };

  if (!session || session.id === undefined) {
    return null;
  }

  const startUrl = session.startUrl || (session as any).start_url || 'Unknown URL';
  const startedAt = session.startedAt || (session as any).started_at;
  const status = session.status || 'unknown';
  const totalPages = session.totalPages !== undefined ? session.totalPages : ((session as any).total_pages || 0);
  const storedDuration = session.duration !== undefined ? session.duration : ((session as any).duration_ms ? Math.round((session as any).duration_ms / 1000) : 0);
  const elapsedTime = calculateElapsedTime(startedAt, status, storedDuration);
  const isRunning = status === 'running' || status === 'auditing';
  const isCancelled = status === 'cancelled';

  return (
    <div
      key={session.id}
      className={`history-card bg-gray-800 border border-gray-700 rounded-lg p-4 sm:p-5 transition-all ${
        isCancelled ? 'opacity-60 cursor-not-allowed' : 'hover:border-purple-500 cursor-pointer'
      }`}
      onClick={() => {
        if (!isCancelled) {
          onSelectCrawl(startUrl, session.id, aeoResult);
        }
      }}
    >
      {/* Header: URL + date on left; badges + delete fixed on right */}
      <div className="history-card-header flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-semibold text-white truncate mb-0.5" title={startUrl}>
            {startUrl}
          </h3>
          <p className="text-xs sm:text-sm text-gray-400">
            {startedAt ? formatDate(startedAt) : 'Unknown date'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-start">
          {getStatusBadge(status)}
          {isReused && (
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-600 text-white whitespace-nowrap">
              ⚡ Reused
            </span>
          )}
          <button
            onClick={(e) => onDeleteSession(e, session.id)}
            disabled={deletingSessionId === session.id}
            className="history-card-delete p-1.5 sm:p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="Delete session"
            aria-label="Delete session"
          >
            {deletingSessionId === session.id ? (
              <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
        <div className="stat-box bg-gray-900 rounded p-2 sm:p-2.5">
          <p className="text-xs text-gray-400">Pages Crawled</p>
          <p className="text-lg sm:text-xl font-bold text-white">{totalPages}</p>
        </div>
        <div className="stat-box bg-gray-900 rounded p-2 sm:p-2.5">
          <p className="text-xs text-gray-400">
            {isRunning ? '🕷️ Elapsed Time' : 'Duration'}
          </p>
          <p className={`text-lg sm:text-xl font-bold ${isRunning ? 'text-purple-400' : 'text-white'}`}>
            {formatDurationWithHours(elapsedTime.seconds, elapsedTime.milliseconds, isRunning)}
            {isRunning && <span className="ml-1 inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse" />}
          </p>
        </div>
      </div>

      {aeoResult && (
        <div className="aeo-score-box bg-gradient-to-r from-purple-900 to-purple-800 rounded p-2.5 sm:p-3 mt-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-purple-200">AEO Score</p>
              <p className="text-2xl font-bold text-white">
                {aeoResult.overallScore !== undefined ? Math.round(aeoResult.overallScore) : 'N/A'}%
              </p>
            </div>
          </div>
        </div>
      )}

      {!aeoResult && status === 'completed' && (
        <div className="mt-3 text-center text-sm text-gray-400">
          No AEO analysis available
        </div>
      )}

      {isCancelled && (
        <div className="mt-3 text-center text-sm text-orange-400 font-medium">
          🛑 Session was cancelled
        </div>
      )}
    </div>
  );
};