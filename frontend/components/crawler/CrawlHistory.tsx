import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './CrawlHistory.css';

interface CrawlHistoryItem {
  session: {
    id: number;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: string;
    startedAt: string;
    completedAt?: string;
    totalPages: number;
    totalResources: number;
    duration: number;
    status: 'running' | 'completed' | 'failed' | 'auditing';
  };
  aeoResult: {
    grade: string;
    gradeColor: string;
    overallScore: number;
    analysisTimestamp: string;
  } | null;
  isReused?: boolean;
}

interface CrawlHistoryProps {
  onSelectCrawl: (url: string, sessionId: number, aeoResult: any) => void;
}

export const CrawlHistory: React.FC<CrawlHistoryProps> = ({ onSelectCrawl }) => {
  const { accessToken, authFetch } = useAuth();
  const [history, setHistory] = useState<CrawlHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    fetchHistory();
    // Refresh history periodically (every 30 seconds)
    const interval = setInterval(fetchHistory, 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  // Update current time every 100ms for live timer calculation with milliseconds
  useEffect(() => {
    const hasRunningSessions = history.some(item => {
      const session = item.session || item;
      return session.status === 'running' || session.status === 'auditing';
    });

    if (hasRunningSessions) {
      const timer = setInterval(() => {
        setCurrentTime(Date.now());
      }, 100); // Update every 100ms for tenths of seconds
      return () => clearInterval(timer);
    }
  }, [history]);


  const fetchHistory = async () => {
    try {
      // Don't set loading to true on background refreshes if we already have data
      if (history.length === 0) setLoading(true);

      const response = await authFetch('/api/crawl-history');

      if (!response.ok) {
        throw new Error('Failed to fetch crawl history');
      }

      const data = await response.json();
      setHistory(data.history);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDurationWithHours = (seconds: number, milliseconds: number = 0, isRunning: boolean = false) => {
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

  const calculateElapsedTime = (startedAt: string | undefined, status: string, storedDuration: number): { seconds: number; milliseconds: number } => {
    // If session is running or auditing, calculate live elapsed time with milliseconds
    if ((status === 'running' || status === 'auditing') && startedAt) {
      const startTime = new Date(startedAt).getTime();
      const elapsedMs = currentTime - startTime;
      return {
        seconds: Math.floor(elapsedMs / 1000),
        milliseconds: Math.floor((elapsedMs % 1000) / 100) // Get tenths of a second
      };
    }
    // For completed sessions, return stored duration
    return { seconds: storedDuration, milliseconds: 0 };
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      running: 'bg-blue-500',
      completed: 'bg-green-500',
      failed: 'bg-red-500',
      auditing: 'bg-yellow-500'
    };
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors[status as keyof typeof colors] || 'bg-gray-500'} text-white`}>
        {status === 'auditing' ? 'AUDITING' : status.toUpperCase()}
      </span>
    );
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation(); // Prevent triggering onSelectCrawl

    if (!window.confirm('Are you sure you want to delete this session? This will permanently remove all data including pages, resources, and audit results.')) {
      return;
    }

    try {
      setDeletingSessionId(sessionId);
      
      const response = await authFetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete session' }));
        throw new Error(errorData.error || 'Failed to delete session');
      }

      // Remove from local state immediately for better UX
      setHistory(prev => prev.filter(item => {
        const session = item.session || item;
        return session.id !== sessionId;
      }));

      // Refresh history to ensure consistency
      await fetchHistory();
    } catch (err: any) {
      alert(`Failed to delete session: ${err.message}`);
      console.error('Delete session error:', err);
    } finally {
      setDeletingSessionId(null);
    }
  };

  if (loading) {
    return (
      <div className="crawl-history-container">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-gray-300">Loading history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="crawl-history-container">
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-200">Error: {error}</p>
          <button
            onClick={fetchHistory}
            className="mt-2 px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-white text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
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
  }

  return (
    <div className="crawl-history-container">
      <h2 className="text-2xl font-bold text-white mb-6">📜 Crawl History</h2>

      <div className="history-grid">
        {history.map((item: any, index) => {
          // Robustly handle both old (flat) and new (nested) formats
          const session = item.session || item;
          const aeoResult = item.aeoResult || (item.aeo_grade ? { overallScore: 0, grade: item.aeo_grade, gradeColor: '#ccc', analysisTimestamp: '' } : null);
          const isReused = item.isReused || false;

          // Safety check: if session is still undefined or doesn't have id, skip or show error
          if (!session || session.id === undefined) {
            console.warn('Invalid crawl history item at index', index, item);
            return null;
          }

          const startUrl = session.startUrl || session.start_url || 'Unknown URL';
          const startedAt = session.startedAt || session.started_at;
          const status = session.status || 'unknown';
          const totalPages = session.totalPages !== undefined ? session.totalPages : (session.total_pages || 0);
          const storedDuration = session.duration !== undefined ? session.duration : (session.duration_ms ? Math.round(session.duration_ms / 1000) : 0);
          const elapsedTime = calculateElapsedTime(startedAt, status, storedDuration);
          const isRunning = status === 'running' || status === 'auditing';

          return (
            <div
              key={session.id}
              className="history-card bg-gray-800 border border-gray-700 rounded-lg p-5 hover:border-purple-500 transition-all cursor-pointer"
              onClick={() => onSelectCrawl(startUrl, session.id, aeoResult)}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white truncate mb-1">
                    {startUrl}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {startedAt ? formatDate(startedAt) : 'Unknown date'}
                  </p>
                </div>
                <div className="flex gap-2 items-start">
                  {getStatusBadge(status)}
                  {isReused && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-600 text-white whitespace-nowrap">
                      ⚡ Reused
                    </span>
                  )}
                  <button
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    disabled={deletingSessionId === session.id}
                    className="ml-2 p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete session"
                    aria-label="Delete session"
                  >
                    {deletingSessionId === session.id ? (
                      <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="stat-box bg-gray-900 rounded p-2">
                  <p className="text-xs text-gray-400">Pages Crawled</p>
                  <p className="text-xl font-bold text-white">{totalPages}</p>
                </div>
                <div className="stat-box bg-gray-900 rounded p-2">
                  <p className="text-xs text-gray-400">
                    {isRunning ? '🕷️ Elapsed Time' : 'Duration'}
                  </p>
                  <p className={`text-xl font-bold ${isRunning ? 'text-purple-400' : 'text-white'}`}>
                    {formatDurationWithHours(elapsedTime.seconds, elapsedTime.milliseconds, isRunning)}
                    {isRunning && <span className="ml-1 inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>}
                  </p>
                </div>
              </div>

              {aeoResult && (
                <div className="aeo-score-box bg-gradient-to-r from-purple-900 to-purple-800 rounded p-3 mt-3">
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
            </div>
          );
        })}
      </div>
    </div>
  );
};

