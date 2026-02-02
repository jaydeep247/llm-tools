import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navbar } from '../components/ui/navbar/Navbar';
import { Footer } from '../components/ui/footer/Footer';
import AEODashboard from './AEODashboard';
import { AnalysisResult } from '../services/api/api';
import { URLInputForm } from '../components/ui/app/URLInputForm/URLInputForm';
import { ErrorDisplay } from '../components/ui/app/ErrorDisplay/ErrorDisplay';
import { ReuseModal } from '../components/ui/app/ReuseModal/ReuseModal';
import { getApiErrorMessage } from '../utils';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStartCrawlMutation, useCancelAuditsMutation, useShareSessionMutation } from '../store/api/module_A/crawlApi';
import { useAnalyzeMutation, useLazyGetAeoResultsQuery, useLazyGetWebsiteScoreQuery } from '../store/api/module_C/aeoApi';
import { useLazyGetDataListQuery } from '../store/api/module_A/dataApi';

const DashboardPage: React.FC = () => {
  const { user, isAuthenticated, logout, refreshUser, accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // RTK Query hooks
  const [startCrawl] = useStartCrawlMutation();
  const [cancelAudits] = useCancelAuditsMutation();
  const [shareSession] = useShareSessionMutation();
  const [analyze] = useAnalyzeMutation();
  const [triggerWebsiteScore] = useLazyGetWebsiteScoreQuery();
  const [getDataList] = useLazyGetDataListQuery();
  const [getAeoResults] = useLazyGetAeoResultsQuery();
  
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runCrawl, setRunCrawl] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Crawler settings
  const [allowSubdomains, setAllowSubdomains] = useState<boolean>(true);
  const [runAudits, setRunAudits] = useState<boolean>(false);
  const [auditDevice, setAuditDevice] = useState<'mobile' | 'desktop'>('desktop');
  const [captureLinkDetails, setCaptureLinkDetails] = useState<boolean>(true);

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
  const [stopping, setStopping] = useState<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  /** Crawl start time (ms) for elapsed timer - set from session.startedAt when loading running session */
  const [crawlStartTime, setCrawlStartTime] = useState<number | null>(null);

  // Reuse prompt state
  const [reusePrompt, setReusePrompt] = React.useState<null | {
    sessionId: number;
    url: string;
    hasAudits?: boolean;
    auditsTriggered?: boolean;
    auditsInProgress?: boolean;
    message?: string;
  }>(null);

  // Check for URL and sessionId in query params on mount
  useEffect(() => {
    const urlParam = searchParams.get('url');
    const sessionIdParam = searchParams.get('sessionId');
    
    if (urlParam && sessionIdParam) {
      const sessionId = parseInt(sessionIdParam, 10);
      if (!isNaN(sessionId)) {
        handleSelectCrawl(urlParam, sessionId, null);
        // Clear query params after loading
        navigate('/dashboard', { replace: true });
      }
    }
  }, []);

  // Server-Sent Events for live updates
  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      console.log('[DashboardPage] SSE: User not authenticated, skipping connection');
      return;
    }

    console.log('[DashboardPage] SSE: Connecting for authenticated user...');

    const eventSource = new EventSource(`/events?token=${accessToken}`);

    eventSource.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      console.log('SSE connected:', data);
    });

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      // Only process events for the current session
      if (data.sessionId && currentSessionId && data.sessionId !== currentSessionId) {
        return;
      }
      setLogs(prev => [...prev.slice(-99), {
        message: data.message,
        timestamp: new Date().toLocaleTimeString()
      }]);
    });

    eventSource.addEventListener('page', (e) => {
      const data = JSON.parse(e.data);
      // Only process events for the current session
      if (data.sessionId && currentSessionId && data.sessionId !== currentSessionId) {
        return;
      }
      setPages(prev => [...prev.slice(-199), data.url]);
      setPageCount(prev => prev + 1);
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      // Only process events for the current session
      if (data.sessionId && currentSessionId && data.sessionId !== currentSessionId) {
        return;
      }
      
      setCrawlStats({
        count: data.count,
        duration: data.duration || 0,
        pagesPerSecond: data.pagesPerSecond || 0
      });
      
      const nextStatus = data.status || 'completed';
      setIsCrawling(nextStatus === 'auditing');
      setCrawlStatus(nextStatus);
      if (nextStatus === 'completed' || nextStatus === 'cancelled') {
        setCrawlStartTime(null);
      }
      
      // Preserve sessionId if provided in done event
      if (data?.sessionId) {
        setCurrentSessionId(data.sessionId);
      }
      
      setLogs(prev => [...prev, {
        message: nextStatus === 'auditing' 
          ? `✅ Crawl completed! Starting audits... Total URLs: ${data.count}`
          : `✅ Crawl completed! Total URLs: ${data.count}`,
        timestamp: new Date().toLocaleTimeString()
      }]);
    });

    eventSource.addEventListener('session-status-update', (e) => {
      try {
        const data = JSON.parse(e.data);
        // Only process events for the current session
        if (data?.sessionId && currentSessionId && data.sessionId !== currentSessionId) {
          return;
        }
        
        if (data?.sessionId && !currentSessionId) {
          setCurrentSessionId(data.sessionId);
        }
        const message = data?.message || `Session ${data?.status || ''}`.trim();
        if (message) {
          setLogs(prev => [...prev.slice(-99), {
            message,
            timestamp: new Date().toLocaleTimeString()
          }]);
        }
        if (data?.status) {
          if (data.status === 'running' || data.status === 'auditing') {
            setIsCrawling(true);
            setCrawlStatus(data.status);
            if (data.sessionId) {
              setCurrentSessionId(data.sessionId);
              getDataList({ sessionId: data.sessionId })
                .unwrap()
                .then((sessionData) => {
                  const startedAt = sessionData.session?.startedAt ?? (sessionData.session as any)?.started_at;
                  if (startedAt) setCrawlStartTime(new Date(startedAt).getTime());
                })
                .catch(() => {});
            }
          } else if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
            setIsCrawling(false);
            setCrawlStatus(data.status);
            setCrawlStartTime(null);
            // Don't clear sessionId when completed - we need it to display the data
            // Only clear on cancelled if explicitly needed
            if (data.status === 'cancelled' && data.clearSessionId) {
              setCurrentSessionId(null);
            }
          }
        }
      } catch { }
    });

    eventSource.addEventListener('audit', (e) => {
      try {
        const data = JSON.parse(e.data);
        // Only process events for the current session
        if (data.sessionId && currentSessionId && data.sessionId !== currentSessionId) {
          return;
        }
        
        const formatNum = (v: unknown) => (typeof v === 'number' && isFinite(v))
          ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : undefined;
        let message = '';
        if (data?.type === 'audit-start') {
          message = `🔍 Audit started: ${data.url}`;
          setIsCrawling(true);
          setCrawlStatus('auditing');
        } else if (data?.type === 'audit-complete') {
          if (data.success) {
            const parts: string[] = [];
            const score = formatNum(data.performanceScore);
            const lcp = formatNum(data.lcp);
            const tbt = formatNum(data.tbt);
            const cls = formatNum(data.cls);
            if (score !== undefined) parts.push(`Score ${score}`);
            if (lcp !== undefined) parts.push(`LCP ${lcp}ms`);
            if (tbt !== undefined) parts.push(`TBT ${tbt}ms`);
            if (cls !== undefined) parts.push(`CLS ${cls}`);
            message = `✅ Audit: ${data.url} ${parts.length ? `(${parts.join(', ')})` : ''}`.trim();
          } else {
            message = `❌ Audit failed: ${data.url}${data.error ? ` - ${data.error}` : ''}`;
          }
        } else if (data?.type === 'audit-progress') {
          const progress = (typeof data.progress === 'number' && isFinite(data.progress))
            ? Number(data.progress).toLocaleString(undefined, { maximumFractionDigits: 2 })
            : undefined;
          const pct = progress ? `${progress}%` : '';
          message = `⏳ Audits progress: ${data.completed}/${data.total} ${pct}`.trim();
        }
        if (message) {
          setLogs(prev => [...prev.slice(-99), {
            message,
            timestamp: new Date().toLocaleTimeString()
          }]);
        }
      } catch { }
    });

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };

    return () => {
      console.log('SSE: Closing connection');
      eventSource.close();
    };
  }, [isAuthenticated, accessToken, currentSessionId, getDataList]);

  // Clear all crawl/history data when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setUrl('');
      setLoading(false);
      setResult(null);
      setError(null);
      setRunCrawl(false);
      setIsCrawling(false);
      setCrawlStatus('idle');
      setPageCount(0);
      setLogs([]);
      setPages([]);
      setCrawlStats(null);
      setCurrentSessionId(null);
      setCrawlStartTime(null);
    }
  }, [isAuthenticated]);

  // Normalize URL
  const normalizeUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;

    if (/^https:\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (/^http:\/\//i.test(trimmed)) {
      return trimmed.replace(/^http:\/\//i, 'https://');
    }

    return `https://${trimmed}`;
  };

  const handleStop = async () => {
    try {
      setStopping(true);
      setError(null);
      
      await cancelAudits({
        sessionId: currentSessionId!,
      }).unwrap();
      
      setLoading(false);
      setIsCrawling(false);
      setCrawlStatus('idle');
      setCurrentSessionId(null);
      setCrawlStartTime(null);
      setLogs(prev => [...prev, {
        message: '🛑 All processes stopped by user',
        timestamp: new Date().toLocaleTimeString()
      }]);
    } catch (err: unknown) {
      const errorMsg = getApiErrorMessage(err, 'Failed to stop analysis');
      setError(errorMsg);
      setLogs(prev => [...prev, {
        message: `⚠️ Error stopping analysis: ${errorMsg}`,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setStopping(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    const normalizedUrl = normalizeUrl(url.trim());

    // Reset ALL states before starting new crawl to prevent stale state
    setLoading(true);
    setResult(null);
    setError(null);
    setStopping(false);
    setIsCrawling(false);
    setCrawlStatus('idle');
    setCurrentSessionId(null);
    setCrawlStartTime(null);
    setReusePrompt(null);

    if (runCrawl) {
      setPageCount(0);
      setLogs([]);
      setPages([]);
      setCrawlStats(null);
    }

    try {
      let analysisResult: any;
      let sessionIdForScore: number | undefined;

      if (runCrawl) {
        // Start crawl first (backend validates URL reachability before creating session)
        const crawlResult = await startCrawl({
          url: normalizedUrl,
          allowSubdomains,
          runAudits,
          auditDevice,
          captureLinkDetails,
        }).unwrap();

        // Check for reuse mode
        if (crawlResult.reuseMode && crawlResult.sessionId) {
          setCurrentSessionId(crawlResult.sessionId);
          const auditsRunning = Boolean(crawlResult.auditsTriggered || crawlResult.auditsInProgress);
          setIsCrawling(auditsRunning);
          setCrawlStatus(auditsRunning ? 'auditing' : 'completed');
          setLoading(false);
          setReusePrompt({
            sessionId: crawlResult.sessionId,
            url: crawlResult.url || normalizedUrl,
            hasAudits: crawlResult.hasAudits,
            auditsTriggered: crawlResult.auditsTriggered,
            auditsInProgress: crawlResult.auditsInProgress,
            message: crawlResult.message,
          });
          return;
        }

        sessionIdForScore = crawlResult.sessionId;
        setCurrentSessionId(crawlResult.sessionId);
        setIsCrawling(true);
        setCrawlStatus('running');
        setCrawlStartTime(Date.now());

        // Then get AEO analysis
        const aeoResult = await analyze({
          url: normalizedUrl,
          sessionId: crawlResult.sessionId,
        }).unwrap();

        // Create a new object instead of mutating the immutable RTK Query result
        const aeoData = aeoResult.results || aeoResult;
        analysisResult = crawlResult.sessionId
          ? { ...aeoData, sessionId: crawlResult.sessionId }
          : aeoData;
      } else {
        // Just analyze without crawl
        const aeoResult = await analyze({
          url: normalizedUrl,
        }).unwrap();

        analysisResult = aeoResult.results || aeoResult;
        sessionIdForScore = (aeoResult as any)?.results?.sessionId ?? (aeoResult as any)?.sessionId;
      }

      if ((analysisResult as any)?.reuseMode && (analysisResult as any)?.sessionId) {
        const sessionId = (analysisResult as any).sessionId;
        setCurrentSessionId(sessionId);
        const auditsRunning = (analysisResult as any).auditsTriggered || (analysisResult as any).auditsInProgress;
        setIsCrawling(auditsRunning);
        setCrawlStatus(auditsRunning ? 'auditing' : 'completed');
        setLoading(false);
        setReusePrompt({
          sessionId: sessionId,
          url: (analysisResult as any).url || normalizedUrl,
          hasAudits: (analysisResult as any).hasAudits,
          auditsTriggered: (analysisResult as any).auditsTriggered,
          auditsInProgress: (analysisResult as any).auditsInProgress,
          message: (analysisResult as any).message,
        });
        return;
      }

      if ((analysisResult as any)?.sessionId) {
        setCurrentSessionId((analysisResult as any).sessionId);
      } else if ((analysisResult as any)?.data?.session?.id) {
        setCurrentSessionId((analysisResult as any).data.session.id);
      } else if ((analysisResult as any)?.session?.id) {
        setCurrentSessionId((analysisResult as any).session.id);
      }

      // Trigger Module E (Content Consistency + Entity Coverage) and merge into result
      try {
        const websiteScoreResult = await triggerWebsiteScore({
          url: normalizedUrl,
          sessionId: sessionIdForScore,
        }).unwrap();
        if (websiteScoreResult?.success && websiteScoreResult?.scores) {
          const existingModuleScores =
            analysisResult.module_scores && typeof analysisResult.module_scores === 'object'
              ? analysisResult.module_scores
              : {};
          analysisResult = {
            ...analysisResult,
            entity_coverage: websiteScoreResult.scores.entity_coverage,
            module_scores: {
              ...existingModuleScores,
              consistency: websiteScoreResult.scores.consistency,
              brand_metrics: websiteScoreResult.scores.brand_metrics,
            },
          };
        }
      } catch {
        // Non-blocking: main AEO result is still shown without Module E scores
      }

      setResult(analysisResult);

      if (runCrawl && (analysisResult as any).data) {
        const data = (analysisResult as any).data;

        if ((analysisResult as any).logs && Array.isArray((analysisResult as any).logs)) {
          setLogs((analysisResult as any).logs.map((log: any) => ({
            message: log.message || log,
            timestamp: log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
          })));
        }

        if (Array.isArray(data)) {
          const sessionPages = data
            .filter((item: any) => item.resourceType === 'page')
            .map((page: any) => page.url);

          setPages(sessionPages);
          setPageCount((analysisResult as any).totalPages || sessionPages.length);

          if ((analysisResult as any).session?.duration) {
            const totalItems = ((analysisResult as any).totalPages || 0) + ((analysisResult as any).totalResources || 0);
            setCrawlStats({
              count: totalItems,
              duration: (analysisResult as any).session.duration || 0,
              pagesPerSecond: totalItems && (analysisResult as any).session.duration
                ? parseFloat((totalItems / (analysisResult as any).session.duration).toFixed(2))
                : 0
            });
          }
        } else if (data.data && Array.isArray(data.data)) {
          const sessionPages = data.data
            .filter((item: any) => item.resourceType === 'page')
            .map((page: any) => page.url);

          setPages(sessionPages);
          setPageCount(data.totalPages || sessionPages.length);

          if (data.session?.duration) {
            const totalItems = (data.totalPages || 0) + (data.totalResources || 0);
            setCrawlStats({
              count: totalItems,
              duration: data.session.duration || 0,
              pagesPerSecond: totalItems && data.session.duration
                ? parseFloat((totalItems / data.session.duration).toFixed(2))
                : 0
            });
          }
        }
      }
    } catch (err: unknown) {
      const apiError = getApiErrorMessage(err, 'Failed to analyze URL');
      setError(apiError);
      if (runCrawl) {
        setIsCrawling(false);
        setCrawlStatus('idle');
        setCurrentSessionId(null);
        setCrawlStartTime(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewPrevious = async () => {
    if (!reusePrompt) return;
    try {
      setLoading(true);
      setCurrentSessionId(reusePrompt.sessionId); // Set the session ID so components can access it
      try {
        await shareSession({ sessionId: reusePrompt.sessionId }).unwrap();
      } catch { }
      
      const sessionData = await getDataList({
        sessionId: reusePrompt.sessionId,
      }).unwrap();
      
      let aeoResult: any = null;
      try {
        const aeoData = await getAeoResults(reusePrompt.sessionId).unwrap();
        aeoResult = aeoData;
      } catch { }
      const sessionPages = (sessionData.data || [])
        .filter((item: any) => item.resourceType === 'page')
        .map((page: any) => page.url);
      setPages(sessionPages);
      setPageCount(sessionData.totalPages || sessionPages.length);
      if (sessionData.logs && Array.isArray(sessionData.logs)) {
        setLogs(sessionData.logs.map((l: any) => ({
          message: l.message,
          timestamp: l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
        })));
      }
      if (sessionData.session) {
        const totalItems = (sessionData.totalPages || 0) + (sessionData.totalResources || 0);
        setCrawlStats({
          count: totalItems,
          duration: sessionData.session.duration || 0,
          pagesPerSecond: totalItems && sessionData.session.duration
            ? parseFloat((totalItems / sessionData.session.duration).toFixed(2))
            : 0
        });

        const sessionStatus = sessionData.session.status;
        setIsCrawling(sessionStatus === 'running' || sessionStatus === 'auditing');
        setCrawlStatus(sessionStatus as 'running' | 'auditing' | 'completed');
        if (sessionStatus === 'running' || sessionStatus === 'auditing') {
          const startedAt = sessionData.session.startedAt ?? (sessionData.session as any).started_at;
          if (startedAt) setCrawlStartTime(new Date(startedAt).getTime());
        } else {
          setCrawlStartTime(null);
        }
      } else {
        setIsCrawling(false);
        setCrawlStatus('completed');
        setCrawlStartTime(null);
      }
      if (aeoResult && aeoResult.results) {
        const r = aeoResult.results;
        setResult({
          success: true,
          url: reusePrompt.url,
          grade: r.grade || 'N/A',
          grade_color: r.gradeColor || '#666666',
          overall_score: r.overallScore || 0,
          module_scores: r.moduleScores,
          module_weights: r.moduleWeights,
          detailed_analysis: r.detailedAnalysis,
          structured_data: r.structuredData,
          all_recommendations: r.recommendations,
          errors: r.errors,
          warnings: r.warnings,
          analysis_timestamp: r.analysisTimestamp,
          run_id: r.runId,
        } as AnalysisResult);
      } else {
        setResult({
          success: true,
          url: reusePrompt.url,
          grade: 'N/A',
          grade_color: '#666666',
          overall_score: 0,
          module_scores: {
            ai_presence: 0,
            competitor_analysis: 0,
            knowledge_base: 0,
            answerability: 0,
            crawler_accessibility: 0,
          },
          module_weights: {
            ai_presence: 0,
            competitor: 0,
            strategy_review: 0,
          },
          detailed_analysis: {
            ai_presence: {},
            competitor_analysis: {},
            knowledge_base: {},
            answerability: {},
            crawler_accessibility: {},
          },
          structured_data: {
            total_schemas: 0,
            valid_schemas: 0,
            invalid_schemas: 0,
            schema_types: [],
            coverage_score: 0,
            quality_score: 0,
            completeness_score: 0,
            seo_relevance_score: 0,
            details: {},
          },
          all_recommendations: [],
          errors: [],
          warnings: [],
        } as AnalysisResult);
      }
      setRunCrawl(true);
      setReusePrompt(null);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to load previous results'));
    } finally {
      setLoading(false);
    }
  };

  const handleRecrawl = async () => {
    if (!reusePrompt) return;
    try {
      // Reset ALL states before starting new crawl
      setReusePrompt(null);
      setLoading(true);
      setError(null);
      setStopping(false);
      setIsCrawling(true);
      setCrawlStatus('running');
      setCurrentSessionId(null);
      setCrawlStartTime(null);
      setLogs([]);
      setPages([]);
      setPageCount(0);
      setCrawlStats(null);
      setResult(null);
      // Start crawl with forceRecrawl
      const crawlResult = await startCrawl({
        url: reusePrompt.url,
        allowSubdomains,
        runAudits,
        auditDevice,
        captureLinkDetails,
        forceRecrawl: true,
      }).unwrap();
      
      // Then get AEO analysis
      const aeoResult = await analyze({
        url: reusePrompt.url,
        sessionId: crawlResult.sessionId,
      }).unwrap();
      
      // Create a new object instead of mutating the immutable RTK Query result
      const aeoData = aeoResult.results || aeoResult;
      const analysisResult = crawlResult.sessionId 
        ? { ...aeoData, sessionId: crawlResult.sessionId }
        : aeoData;
      setResult(analysisResult);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to start re-crawl'));
      setIsCrawling(false);
      setCrawlStatus('idle');
      setCurrentSessionId(null);
      setCrawlStartTime(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle selecting a crawl from history
  const handleSelectCrawl = async (crawlUrl: string, sessionId: number, aeoResult: any) => {
    // Reset all states before loading a historical session
    setUrl(crawlUrl);
    setLoading(true);
    setError(null);
    setStopping(false);
    setCurrentSessionId(sessionId);
    setReusePrompt(null);

    try {
      const sessionData = await getDataList({
        sessionId,
      }).unwrap();

      const sessionStatus = sessionData.session?.status || sessionData.statistics?.status || 'unknown';
      if (sessionStatus === 'cancelled') {
        setLoading(false);
        setIsCrawling(false);
        setCrawlStatus('cancelled');
        setPageCount(0);
        setPages([]);
        setCrawlStats(null);
        setResult(null);
        setRunCrawl(true);
        setCrawlStartTime(null);
        setLogs([{
          message: '🛑 Session was cancelled',
          timestamp: new Date().toLocaleTimeString()
        }]);
        return;
      }

      const pagesArray = sessionData.data || [];
      const sessionPages = pagesArray
        .filter((item: any) => item.resourceType === 'page')
        .map((page: any) => page.url);

      setPages(sessionPages);

      const totalPages = sessionData.statistics?.totalPages ?? sessionData.session?.totalPages ?? sessionData.totalPages ?? sessionPages.length;
      setPageCount(totalPages);

      if (sessionData.logs && sessionData.logs.length > 0) {
        const logMessages = sessionData.logs.map((log: any) => ({
          message: log.message,
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

      let restoredResult: AnalysisResult | null = null;

      try {
        const fetchedAeo = await getAeoResults(sessionId).unwrap();
        if (fetchedAeo) {
          if (fetchedAeo && fetchedAeo.results) {
            const r = fetchedAeo.results;
            restoredResult = {
              success: true,
              url: crawlUrl,
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
        console.error('[DEBUG] Error while fetching full AEO result:', aeoError);
      }

      if (!restoredResult && aeoResult) {
        restoredResult = {
          success: true,
          url: crawlUrl,
          grade: aeoResult.grade,
          grade_color: aeoResult.gradeColor,
          overall_score: aeoResult.overallScore,
          module_scores: aeoResult.moduleScores,
          module_weights: aeoResult.moduleWeights,
          detailed_analysis: aeoResult.detailedAnalysis,
          structured_data: aeoResult.structuredData,
          all_recommendations: aeoResult.recommendations,
          errors: aeoResult.errors,
          warnings: aeoResult.warnings,
          analysis_timestamp: aeoResult.analysisTimestamp,
          run_id: aeoResult.runId
        } as AnalysisResult;
      }

      if (!restoredResult) {
        restoredResult = {
          success: true,
          url: crawlUrl,
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
      setCurrentSessionId(sessionId); // Ensure sessionId is set even if there was an error

    } catch (error: unknown) {
      console.error('[DEBUG] Failed to restore session data:', error);
      setError(getApiErrorMessage(error, 'Failed to restore crawl data'));

      if (aeoResult || true) {
        const placeholder: AnalysisResult = aeoResult ? {
          success: true,
          url: crawlUrl,
          grade: aeoResult.grade,
          grade_color: aeoResult.gradeColor,
          overall_score: aeoResult.overallScore,
          module_scores: aeoResult.moduleScores,
          module_weights: aeoResult.moduleWeights,
          detailed_analysis: aeoResult.detailedAnalysis,
          structured_data: aeoResult.structuredData,
          all_recommendations: aeoResult.recommendations,
          errors: aeoResult.errors,
          warnings: aeoResult.warnings,
          analysis_timestamp: aeoResult.analysisTimestamp,
          run_id: aeoResult.runId
        } : {
          success: true,
          url: crawlUrl,
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

        setResult(placeholder);
        setRunCrawl(true);
        setCurrentSessionId(sessionId); // Ensure sessionId is set even in error case
      }
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
    // Stop all running operations before logout
    if (currentSessionId && (isCrawling || loading)) {
      try {
        await cancelAudits({
          sessionId: currentSessionId,
        }).unwrap();
        
        // Reset all states
        setLoading(false);
        setIsCrawling(false);
        setCrawlStatus('idle');
        setCurrentSessionId(null);
        setCrawlStartTime(null);
      } catch (err) {
        console.error('Error stopping operations during logout:', err);
      }
    }
    
    await logout();
    navigate('/');
  };

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
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-4">
            Content Analytics & AEO Intelligence
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Analyze your website's structured data and get actionable insights to improve
            your search engine visibility and Answer Engine Optimization (AEO).
          </p>
        </div>

        {/* Input Form */}
        <div className="max-w-4xl mx-auto mb-8">
          <URLInputForm
            url={url}
            setUrl={setUrl}
            loading={loading}
            stopping={stopping}
            isCrawling={isCrawling}
            crawlStatus={crawlStatus}
            runCrawl={runCrawl}
            setRunCrawl={setRunCrawl}
            showAdvanced={showAdvanced}
            setShowAdvanced={setShowAdvanced}
            runAudits={runAudits}
            setRunAudits={setRunAudits}
            auditDevice={auditDevice}
            setAuditDevice={setAuditDevice}
            allowSubdomains={allowSubdomains}
            setAllowSubdomains={setAllowSubdomains}
            captureLinkDetails={captureLinkDetails}
            setCaptureLinkDetails={setCaptureLinkDetails}
            onSubmit={handleSubmit}
            onStop={handleStop}
          />
        </div>

        {/* Error Display */}
        <ErrorDisplay error={error} />

        {/* Helper function and rendering logic */}
        {(() => {
          // Helper function to check if result has AEO analysis data from backend
          const hasAEOAnalysisData = (res: AnalysisResult | null): boolean => {
            if (!res) return false;
            
            // Check for AEO-specific fields that indicate the analysis is complete
            return !!(
              res.overall_score !== undefined ||
              res.grade !== undefined ||
              res.module_scores !== undefined ||
              res.detailed_analysis !== undefined ||
              (res as any)?.results?.overall_score !== undefined ||
              (res as any)?.results?.grade !== undefined ||
              (res as any)?.results?.module_scores !== undefined
            );
          };

          const hasAEOData = hasAEOAnalysisData(result);

          return (
            <>
              {/* Loading state - show while waiting for backend response */}
              {(loading || (result && !hasAEOData)) && (
                <div className="max-w-7xl mx-auto mb-8 text-center py-12">
                  <div className="text-lg text-gray-400">
                    {loading 
                      ? "Analyzing website and waiting for response..." 
                      : "Waiting for AEO analysis to complete..."}
                  </div>
                  {runCrawl && (isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing') && (
                    <div className="text-sm text-gray-500 mt-2">
                      {crawlStatus === 'auditing' 
                        ? "Audits in progress... AEO analysis will begin after audits complete."
                        : "Crawling in progress... AEO analysis will begin after crawl completes."}
                    </div>
                  )}
                </div>
              )}

              {/* Results - Only show after backend AEO analysis response is complete */}
              {hasAEOData && (
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
                    sessionId={currentSessionId}
                    crawlStartTime={crawlStartTime}
                  />
                </div>
              )}
            </>
          );
        })()}
        
        {/* Reuse Modal */}
        <ReuseModal
          reusePrompt={reusePrompt}
          onClose={() => setReusePrompt(null)}
          onViewPrevious={handleViewPrevious}
          onRecrawl={handleRecrawl}
        />
      </div>
      </main>
      <Footer />
    </div>
  );
};

export default DashboardPage;
