import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Navbar } from '../components/ui/navbar/Navbar';
import { Footer } from '../components/ui/footer/Footer';
import AEODashboard from './AEODashboard';
import { AnalysisResult } from '../services/api/api';
import { useLazyGetDataListQuery, useLazyGetAeoResultsQuery } from '../store/api';
import { ErrorDisplay } from '../components/ui/app/ErrorDisplay/ErrorDisplay';
import { getApiErrorMessage } from '../utils';

const HistoryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout, refreshUser, accessToken } = useAuth();
  const [getDataList] = useLazyGetDataListQuery();
  const [getAeoResults] = useLazyGetAeoResultsQuery();
  
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runCrawl, setRunCrawl] = useState<boolean>(true);
  
  // Live crawling state
  const [isCrawling, setIsCrawling] = useState<boolean>(false);
  const [crawlStatus, setCrawlStatus] = useState<'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'>('idle');
  const [pageCount, setPageCount] = useState<number>(0);
  const [logs, setLogs] = useState<{ message: string; timestamp: string }[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [crawlStats, setCrawlStats] = useState<{
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null>(null);
  /** Crawl start time (ms) for elapsed timer - set from session.startedAt when loading running session */
  const [crawlStartTime, setCrawlStartTime] = useState<number | null>(null);

  // Load session data on mount
  useEffect(() => {
    if (!id) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }

    const sessionId = parseInt(id, 10);
    if (isNaN(sessionId)) {
      setError('Invalid session ID');
      setLoading(false);
      return;
    }

    loadSessionData(sessionId);
  }, [id]);

  const loadSessionData = async (sessionId: number) => {
    try {
      setLoading(true);
      setError(null);

      // Fetch session data
      const sessionData = await getDataList({
        sessionId,
      }).unwrap();

      // Check if session is cancelled
      const sessionStatus = sessionData.session?.status || sessionData.statistics?.status || 'unknown';
      if (sessionStatus === 'cancelled') {
        setLoading(false);
        setIsCrawling(false);
        setCrawlStatus('cancelled');
        setPageCount(0);
        setPages([]);
        setCrawlStats(null);
        setResult(null);
        setRunCrawl(false);
        setCrawlStartTime(null);
        setLogs([{
          message: '🛑 Session was cancelled',
          timestamp: new Date().toLocaleTimeString()
        }]);
        return;
      }

      // Extract pages from session data first
      const pagesArray = sessionData.data || [];
      const sessionPages = pagesArray
        .filter((item: any) => item.resourceType === 'page')
        .map((page: any) => page.url);

      // Extract URL from session - try multiple sources
      let crawlUrl = sessionData.session?.start_url 
        || sessionData.session?.startUrl 
        || sessionData.session?.url 
        || '';
      
      // If no URL from session, use first page URL as fallback
      if (!crawlUrl && sessionPages.length > 0) {
        crawlUrl = sessionPages[0];
      }
      
      setUrl(crawlUrl);

      setPages(sessionPages);

      // Get page count
      const totalPages = sessionData.statistics?.totalPages ?? sessionData.session?.totalPages ?? sessionData.totalPages ?? sessionPages.length;
      setPageCount(totalPages);

      // Restore logs
      if (sessionData.logs && sessionData.logs.length > 0) {
        const logMessages = sessionData.logs.map((log: any) => ({
          message: log.message || log,
          timestamp: log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
        }));
        setLogs(logMessages);
      } else {
        const now = new Date().toLocaleTimeString();
        setLogs([
          { message: `📜 Crawl completed for ${crawlUrl}`, timestamp: now },
          { message: `Total pages: ${totalPages}`, timestamp: now }
        ]);
      }

      // Set crawl stats
      const statsObj = sessionData.statistics || sessionData.session;
      if (statsObj) {
        const totalItems = (statsObj.totalPages || 0) + (statsObj.totalResources || 0);
        const duration = sessionData.session?.duration || 0;
        setCrawlStats({
          count: totalItems,
          duration: duration,
          pagesPerSecond: duration
            ? parseFloat((totalItems / duration).toFixed(2))
            : 0
        });

        const sessionStatus = sessionData.session?.status || 'completed';
        setIsCrawling(sessionStatus === 'running' || sessionStatus === 'auditing');
        setCrawlStatus(sessionStatus as 'running' | 'auditing' | 'completed' | 'cancelled');
        if (sessionStatus === 'running' || sessionStatus === 'auditing') {
          const startedAt = sessionData.session?.startedAt ?? (sessionData.session as any)?.started_at;
          if (startedAt) setCrawlStartTime(new Date(startedAt).getTime());
        } else {
          setCrawlStartTime(null);
        }
      } else {
        setCrawlStats({
          count: totalPages,
          duration: 0,
          pagesPerSecond: 0
        });
        setIsCrawling(false);
        setCrawlStatus('completed');
        setCrawlStartTime(null);
      }

      // Fetch AEO result for this session
      let restoredResult: AnalysisResult | null = null;

      try {
        const fetchedAeo = await getAeoResults(sessionId).unwrap();
        if (fetchedAeo) {
          if (fetchedAeo && fetchedAeo.results) {
            const r = fetchedAeo.results;
            // Use URL from AEO result if available, otherwise use crawlUrl
            const resultUrl = r.url || crawlUrl;
            if (resultUrl && !crawlUrl) {
              setUrl(resultUrl);
            }
            restoredResult = {
              success: true,
              url: resultUrl || crawlUrl,
              grade: r.grade || 'N/A',
              grade_color: r.gradeColor || r.grade_color || '#666666',
              overall_score: r.overallScore || r.overall_score || 0,
              module_scores: r.moduleScores || r.module_scores,
              module_weights: r.moduleWeights || r.module_weights,
              detailed_analysis: r.detailedAnalysis || r.detailed_analysis,
              structured_data: r.structuredData || r.structured_data,
              all_recommendations: r.recommendations || r.all_recommendations,
              errors: r.errors,
              warnings: r.warnings,
              analysis_timestamp: r.analysisTimestamp || r.analysis_timestamp,
              run_id: r.runId || r.run_id,
              entity_coverage: r.entity_coverage
            } as AnalysisResult;
          }
        }
      } catch (aeoError) {
        console.error('[HistoryDetailPage] Error while fetching AEO result:', aeoError);
      }

      // Fallback to placeholder if no AEO result
      if (!restoredResult) {
        // Ensure we have a URL - use first page if crawlUrl is still empty
        const finalUrl = crawlUrl || (sessionPages.length > 0 ? sessionPages[0] : 'Unknown URL');
        if (!crawlUrl && finalUrl !== 'Unknown URL') {
          setUrl(finalUrl);
        }
        restoredResult = {
          success: true,
          url: finalUrl,
          grade: 'N/A',
          grade_color: '#666666',
          overall_score: 0,
          module_scores: { ai_presence: 0, competitor_analysis: 0, knowledge_base: 0, answerability: 0, crawler_accessibility: 0 },
          module_weights: { ai_presence: 0, competitor: 0, strategy_review: 0 },
          detailed_analysis: { ai_presence: {}, competitor_analysis: {}, knowledge_base: {}, answerability: {}, crawler_accessibility: {} },
          structured_data: { total_schemas: 0, valid_schemas: 0, invalid_schemas: 0, schema_types: [], coverage_score: 0, quality_score: 0, completeness_score: 0, seo_relevance_score: 0, details: {} },
          all_recommendations: [],
          errors: [],
          warnings: [],
        } as AnalysisResult;
      }

      setResult(restoredResult);
      setRunCrawl(true);

    } catch (error: unknown) {
      console.error('[HistoryDetailPage] Failed to load session data:', error);
      setError(getApiErrorMessage(error, 'Failed to load session data'));
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = async (view: string) => {
    if (view === 'profile') {
      try { await refreshUser(); } catch { }
    }
    navigate(`/${view}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black aeo-dark" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
        <Navbar
          user={user}
          isAuthenticated={isAuthenticated}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          currentView={window.location.pathname}
        />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-300 text-lg">Loading session data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black aeo-dark flex flex-col" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
      <Navbar
        user={user}
        isAuthenticated={isAuthenticated}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        currentView={window.location.pathname}
      />

      <main className="flex-1">
      <div className="container mx-auto px-4 py-8">
        {/* Header with back button */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate('/history')}
              className="mb-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              ← Back to History
            </button>
            <h2 className="text-3xl font-bold text-white mb-2">
              {loading ? (
                <>Session #{id} - <span className="text-gray-400">Loading...</span></>
              ) : url ? (
                <>Session #{id} - {url}</>
              ) : (
                <>Session #{id}</>
              )}
            </h2>
            <p className="text-lg text-gray-300">
              Viewing crawl session data and analysis results
            </p>
          </div>
        </div>

        {/* Error Display */}
        <ErrorDisplay error={error} />

        {/* Results */}
        {result && (
          <div className="max-w-7xl mx-auto mb-8">
            <AEODashboard
              url={url}
              result={result}
              runCrawl={runCrawl}
              isCrawling={isCrawling}
              crawlStatus={crawlStatus}
              pageCount={pageCount}
              crawlStats={crawlStats}
              logs={logs}
              discoveredPages={pages}
              sessionId={id ? parseInt(id, 10) : null}
              crawlStartTime={crawlStartTime}
            />
          </div>
        )}

        {!result && !error && (
          <div className="max-w-7xl mx-auto">
            <div className="bg-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-400 text-lg">No analysis data available for this session.</p>
            </div>
          </div>
        )}
      </div>
      </main>
      <Footer />
    </div>
  );
};

export default HistoryDetailPage;
