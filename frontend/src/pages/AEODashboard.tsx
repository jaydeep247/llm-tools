import React, { useState, useEffect } from 'react';
import './AEODashboard.css';
import { useLazyGetWebsiteScoreQuery, useSimulateAnswerMutation, useAnalyzeBulkMutation } from '../store/api/module_C/aeoApi';
import {
  OverallScoreSection,
  DashboardCards,
  DashboardTabs,
  RecommendationsModal,
  useAEOData,
  useSchemaGenerator,
  AEODashboardProps,
  ActiveView
} from '../components/aeo';



const AEODashboard: React.FC<AEODashboardProps> = ({
  url = 'https://yogreet.com',
  result,
  onAnalyze,
  runCrawl = false,
  isCrawling = false,
  crawlStatus = 'idle',
  pageCount = 0,
  crawlStats = null,
  logs = [],
  discoveredPages = [],
  sessionId
}) => {
  const [activeView, setActiveView] = useState<ActiveView>(runCrawl ? 'crawler' : 'data');
  const [showRecommendations, setShowRecommendations] = useState<string | null>(null);
  
  // Use custom hooks for better organization
  const { scores, aiPlatforms, competitors, strategyMetrics, getModuleRecommendations, contentMetrics, entityMetrics } = useAEOData(result);
  const {
    schemaData,
    schemaLoading,
    schemaError,
    copiedSchema,
    schemaFormat,
    selectedSchemaType,
    setSchemaFormat,
    setSelectedSchemaType,
    generateSchema,
    copySchemaToClipboard
  } = useSchemaGenerator();

  // Simulator State
  const [simulationQuery, setSimulationQuery] = useState('');
  const [simulationResults, setSimulationResults] = useState<any>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);

  // Module E State
  const [moduleEScores, setModuleEScores] = useState<any>(null);
  const [moduleELoading, setModuleELoading] = useState(false);
  const [moduleEError, setModuleEError] = useState<string | null>(null);

  // Bulk Audit State
  const [auditMode, setAuditMode] = useState<'single' | 'bulk'>('single');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<any>(null);

  // Live timer state
  const [crawlStartTime, setCrawlStartTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Track crawl start time when crawling begins
  useEffect(() => {
    const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing';
    
    if (isActive && !crawlStartTime) {
      // Crawl just started - record start time
      setCrawlStartTime(Date.now());
    } else if (!isActive && crawlStartTime) {
      // Crawl stopped - clear start time
      setCrawlStartTime(null);
    }
  }, [isCrawling, crawlStatus, crawlStartTime]);

  // Update current time every 100ms when crawling for smooth millisecond display
  useEffect(() => {
    const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing';
    
    if (isActive) {
      const timer = setInterval(() => {
        setCurrentTime(Date.now());
      }, 100); // Update every 100ms for tenths of seconds
      return () => clearInterval(timer);
    }
  }, [isCrawling, crawlStatus]);

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

  const [getWebsiteScore] = useLazyGetWebsiteScoreQuery();
  const [simulateAnswer] = useSimulateAnswerMutation();
  const [analyzeBulk] = useAnalyzeBulkMutation();

  const analyzeWebsiteScores = async () => {
    if (!url) return;
    setModuleELoading(true);
    setModuleEError(null);
    try {
      const data = await getWebsiteScore({
        url,
        sessionId: result?.session_id,
      }).unwrap();
      if (data.success) {
        setModuleEScores(data.scores);
      } else {
        setModuleEError(data.error || 'Analysis failed');
      }
    } catch (e: any) {
      setModuleEError(e?.data?.error || e?.message || 'Analysis failed');
    } finally {
      setModuleELoading(false);
    }
  };

  // Load Module E data from result when available (from actualResult or top-level result after website-score merge).
  // Only merge defined values so we never overwrite moduleEScores (e.g. from "Run Analysis") with undefined.
  useEffect(() => {
    if (!result) return;

    const actualResult = result?.results || result;

    const fromResult = {
      consistency:
        actualResult?.module_scores?.consistency ??
        result?.module_scores?.consistency ??
        (result as any)?.scores?.consistency,
      entity_coverage:
        actualResult?.entity_coverage ?? result?.entity_coverage ?? (result as any)?.scores?.entity_coverage,
      brand_metrics:
        actualResult?.module_scores?.brand_metrics ??
        result?.module_scores?.brand_metrics ??
        (result as any)?.scores?.brand_metrics,
      model_wise_performance:
        actualResult?.module_scores?.model_wise_performance ??
        result?.module_scores?.model_wise_performance ??
        actualResult?.model_wise_performance ??
        (result as any)?.model_wise_performance,
      response_accuracy:
        actualResult?.module_scores?.response_accuracy ??
        result?.module_scores?.response_accuracy ??
        actualResult?.response_accuracy ??
        (result as any)?.response_accuracy,
      citation_metrics:
        actualResult?.citation_metrics ?? (result as any)?.citation_metrics,
      url: actualResult?.url ?? result?.url
    };

    const hasAnyFromResult =
      fromResult.consistency !== undefined ||
      fromResult.entity_coverage != null ||
      fromResult.brand_metrics != null ||
      fromResult.model_wise_performance != null ||
      fromResult.response_accuracy != null ||
      fromResult.citation_metrics != null;

    if (!hasAnyFromResult) return;

    setModuleEScores((prev: any) => {
      const next = { ...prev };
      if (fromResult.consistency !== undefined) next.consistency = fromResult.consistency;
      if (fromResult.entity_coverage != null) next.entity_coverage = fromResult.entity_coverage;
      if (fromResult.brand_metrics != null) next.brand_metrics = fromResult.brand_metrics;
      if (fromResult.model_wise_performance != null) next.model_wise_performance = fromResult.model_wise_performance;
      if (fromResult.response_accuracy != null) next.response_accuracy = fromResult.response_accuracy;
      if (fromResult.citation_metrics != null) next.citation_metrics = fromResult.citation_metrics;
      if (fromResult.url != null && fromResult.url !== '') next.url = fromResult.url;
      return next;
    });
  }, [result]);

  const handleSimulation = async () => {
    if (!simulationQuery) return;
    setSimulationLoading(true);
    try {
      const response = await simulateAnswer({
        url,
        query: simulationQuery,
      }).unwrap();
      setSimulationResults(response.results);
    } catch (error) {
      console.error("Simulation failed:", error);
    } finally {
      setSimulationLoading(false);
    }
  };

  // Find this function in your code and replace it
  const handleBulkAnalyze = async () => {
    // 1. Validate Input
    const cleanedUrl = sitemapUrl.trim();
    if (!cleanedUrl) {
      alert("Please enter a valid Sitemap URL");
      return;
    }

    setBulkLoading(true);
    try {
      const response = await analyzeBulk({
        sitemap: cleanedUrl,
      }).unwrap();
      // 2. Safe Unwrapping: Handle if backend returns { data: ... } or just the data directly
      setBulkResults(response.data || response);
    } catch (error) {
      console.error("Bulk analysis failed:", error);
      alert("Bulk analysis failed. Check console for details.");
    } finally {
      setBulkLoading(false);
    }
  };

  // Generate schema markup
  const handleGenerateSchema = () => generateSchema(url);

  const getRecommendationPriority = (rec: string): 'high' | 'medium' | 'low' => {
    const recLower = rec.toLowerCase();

    const highPriorityKeywords = [
      'add title tag',
      'add meta description',
      'allow indexing',
      'robots.txt',
      'sitemap',
      'schema',
      'structured data',
      'faq section',
      'canonical',
      'organization schema',
      'website schema',
      'webpage schema'
    ];

    const mediumPriorityKeywords = [
      'improve',
      'enhance',
      'optimize',
      'add more',
      'better',
      'clear',
      'formatting',
      'alt text',
      'open graph',
      'twitter card'
    ];

    if (highPriorityKeywords.some(keyword => recLower.includes(keyword))) {
      return 'high';
    }

    if (mediumPriorityKeywords.some(keyword => recLower.includes(keyword))) {
      return 'medium';
    }

    return 'low';
  };

  return (
    <div className="aeo-dashboard">
      <OverallScoreSection 
        scores={scores}
        result={result}
      />

      <DashboardCards
        scores={scores}
        aiPlatforms={aiPlatforms}
        competitors={competitors}
        strategyMetrics={strategyMetrics}
        result={result}
        getModuleRecommendations={getModuleRecommendations}
        setShowRecommendations={setShowRecommendations}
      />

      <DashboardTabs
        activeView={activeView}
        setActiveView={(view: string) => setActiveView(view as typeof activeView)}
        runCrawl={runCrawl}
        isCrawling={isCrawling}
        crawlStatus={crawlStatus}
        pageCount={pageCount}
        crawlStats={crawlStats}
        logs={logs}
        discoveredPages={discoveredPages}
        crawlStartTime={crawlStartTime}
        currentTime={currentTime}
        result={result}
        url={url}
        sessionId={sessionId}
        schemaData={schemaData}
        schemaLoading={schemaLoading}
        schemaError={schemaError}
        copiedSchema={copiedSchema}
        schemaFormat={schemaFormat}
        selectedSchemaType={selectedSchemaType}
        setSchemaFormat={setSchemaFormat}
        setSelectedSchemaType={setSelectedSchemaType}
        generateSchema={handleGenerateSchema}
        copySchemaToClipboard={copySchemaToClipboard}
        auditMode={auditMode}
        setAuditMode={setAuditMode}
        sitemapUrl={sitemapUrl}
        setSitemapUrl={setSitemapUrl}
        bulkLoading={bulkLoading}
        bulkResults={bulkResults}
        handleBulkAnalyze={handleBulkAnalyze}
        moduleEScores={moduleEScores}
        moduleELoading={moduleELoading}
        moduleEError={moduleEError}
        competitors={competitors}
        simulationQuery={simulationQuery}
        setSimulationQuery={setSimulationQuery}
        simulationResults={simulationResults}
        simulationLoading={simulationLoading}
        handleSimulation={handleSimulation}
        contentMetrics={contentMetrics}
        entityMetrics={entityMetrics}
      />

      <RecommendationsModal
        showRecommendations={showRecommendations}
        setShowRecommendations={setShowRecommendations}
        getModuleRecommendations={getModuleRecommendations}
      />
    </div>
  );
};

export default AEODashboard;