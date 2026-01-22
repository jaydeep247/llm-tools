import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CrawlHistoryCard, LoadingState, ErrorState, EmptyState, CrawlHistoryItem } from '../components/module_A/crawler';
import './CrawlHistory.css';

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
    const interval = setInterval(fetchHistory, 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  useEffect(() => {
    const hasRunningSessions = history.some(item => {
      const session = item.session || item;
      return session.status === 'running' || session.status === 'auditing';
    });

    if (hasRunningSessions) {
      const timer = setInterval(() => {
        setCurrentTime(Date.now());
      }, 100);
      return () => clearInterval(timer);
    }
  }, [history]);


  const fetchHistory = async () => {
    try {
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

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();

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

      setHistory(prev => prev.filter(item => {
        const session = item.session || item;
        return session.id !== sessionId;
      }));

      await fetchHistory();
    } catch (err: any) {
      alert(`Failed to delete session: ${err.message}`);
      console.error('Delete session error:', err);
    } finally {
      setDeletingSessionId(null);
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={fetchHistory} />;
  }

  if (history.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="crawl-history-container">
      <h2 className="text-2xl font-bold text-white mb-6">📜 Crawl History</h2>

      <div className="history-grid">
        {history.map((item: any, index) => (
          <CrawlHistoryCard
            key={item.session?.id || item.id || index}
            item={item}
            onSelectCrawl={onSelectCrawl}
            onDeleteSession={handleDeleteSession}
            deletingSessionId={deletingSessionId}
            currentTime={currentTime}
          />
        ))}
      </div>
    </div>
  );
};

