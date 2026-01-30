import React from 'react';
import DataViewer from '../../pages/DataViewer';
import LinkExplorer from '../../pages/LinkExplorer';
import { MindMapWebTree } from '../module_A/crawler';
import AuditsPage from '../../pages/AuditsPage';
import PageMetrics from '../module_C/aeo/PageMetrics';
import { WordcountAnalysis, BrokenLinkChecker, AuditChecker, SerpAnalysis, TextQualityAnalyzer } from '../module_A';
import CrawlerContent from './CrawlerContent';
import SchemaGenerator from './SchemaGenerator';
import IntelligenceModule from './IntelligenceModule';
import ModuleE from './ModuleE';
import AISimulator from './AISimulator';
import ContentMetrics from './ContentMetrics';
import AnswerCompletenessScore from './AnswerCompletenessScore';


interface Competitor {
  name: string;
  count: number;
}

interface DashboardTabsProps {
  activeView: string;
  setActiveView: (view: string) => void;
  runCrawl: boolean;
  isCrawling: boolean;
  crawlStatus: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled';
  pageCount: number;
  crawlStats: { count: number; duration: number; pagesPerSecond: number; } | null;
  logs: { message: string; timestamp: string }[];
  discoveredPages: any[];
  crawlStartTime: number | null;
  currentTime: number;
  result?: any;
  url: string;
  sessionId?: number | null;
  
  // Schema Generator props
  schemaData: any;
  schemaLoading: boolean;
  schemaError: string | null;
  copiedSchema: boolean;
  schemaFormat: 'json-ld' | 'rdfa';
  selectedSchemaType: string;
  setSchemaFormat: (format: 'json-ld' | 'rdfa') => void;
  setSelectedSchemaType: (type: string) => void;
  generateSchema: () => void;
  copySchemaToClipboard: () => void;
  
  // Intelligence Module props
  auditMode: 'single' | 'bulk';
  setAuditMode: (mode: 'single' | 'bulk') => void;
  sitemapUrl: string;
  setSitemapUrl: (url: string) => void;
  bulkLoading: boolean;
  bulkResults: any;
  handleBulkAnalyze: () => void;
  
  // Module E props
  moduleEScores: any;
  moduleELoading: boolean;
  moduleEError: string | null;
  competitors: Competitor[];
  
  // AI Simulator props
  simulationQuery: string;
  setSimulationQuery: (query: string) => void;
  simulationResults: any;
  simulationLoading: boolean;
  handleSimulation: () => void;
  
  // Content Metrics props
  contentMetrics?: any;
  entityMetrics?: any;
  
  // Answer Completeness Score props
  answerCompletenessData?: any;
}

const DashboardTabs: React.FC<DashboardTabsProps> = (props) => {
  const {
    activeView,
    setActiveView,
    runCrawl,
    isCrawling,
    crawlStatus,
    pageCount,
    crawlStats,
    logs,
    discoveredPages,
    crawlStartTime,
    currentTime,
    result,
    url,
    sessionId,
    schemaData,
    schemaLoading,
    schemaError,
    copiedSchema,
    schemaFormat,
    selectedSchemaType,
    setSchemaFormat,
    setSelectedSchemaType,
    generateSchema,
    copySchemaToClipboard,
    auditMode,
    setAuditMode,
    sitemapUrl,
    setSitemapUrl,
    bulkLoading,
    bulkResults,
    handleBulkAnalyze,
    moduleEScores,
    moduleELoading,
    moduleEError,
    competitors,
    simulationQuery,
    setSimulationQuery,
    simulationResults,
    simulationLoading,
    handleSimulation,
    contentMetrics,
    entityMetrics,
    answerCompletenessData
  } = props;

  // Helper function to extract session ID (prioritizing prop sessionId, then result object)
  // This ensures that when a new crawl completes, it automatically uses the generated session ID
  const getEffectiveSessionId = (): number | null => {
    // First, prioritize the sessionId prop (from currentSessionId state in DashboardPage)
    // This is the most reliable source as it's set when the crawl starts
    if (sessionId) {
      console.log('[DashboardTabs] Using sessionId from prop:', sessionId);
      return sessionId;
    }
    
    // Fall back to result object if prop is not available
    if (result) {
      // Check multiple possible locations in result object
      const resultSessionId = (result as any)?.sessionId 
        || (result as any)?.session?.id 
        || (result as any)?.data?.session?.id 
        || (result as any)?.session_id;
      
      if (resultSessionId) {
        console.log('[DashboardTabs] Using sessionId from result:', resultSessionId);
        return resultSessionId;
      }
    }
    
    console.warn('[DashboardTabs] No sessionId found. sessionId prop:', sessionId, 'result:', result);
    return null;
  };

  const effectiveSessionId = getEffectiveSessionId();

  return (
    <div className="dashboard-tabs">
      <div className="tab-navigation">
        {runCrawl && (
          <button
            onClick={() => setActiveView('crawler')}
            className={`tab-button ${activeView === 'crawler' ? 'active' : ''}`}
          >
            🕷️ Crawler {isCrawling && <span className="ml-1 inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>}
          </button>
        )}
        <button
          onClick={() => setActiveView('data')}
          className={`tab-button ${activeView === 'data' ? 'active' : ''}`}
        >
          📋 Crawled Data
        </button>
        <button
          onClick={() => setActiveView('page_metrics')}
          className={`tab-button ${activeView === 'page_metrics' ? 'active' : ''}`}
        >
          📊 Page Metrics
        </button>
        <button
          onClick={() => setActiveView('text_quality_analyzer')}
          className={`tab-button ${activeView === 'text_quality_analyzer' ? 'active' : ''}`}
        >
          ✨ Text Quality Analyzer
        </button>
        <button
          onClick={() => setActiveView('serp_analysis')}
          className={`tab-button ${activeView === 'serp_analysis' ? 'active' : ''}`}
        >
          🔍 SERP Analysis
        </button>
        <button
          onClick={() => setActiveView('wordcount_analysis')}
          className={`tab-button ${activeView === 'wordcount_analysis' ? 'active' : ''}`}
        >
          📝 Wordcount Analysis
        </button>
        <button
          onClick={() => setActiveView('broken_links')}
          className={`tab-button ${activeView === 'broken_links' ? 'active' : ''}`}
        >
          🔗 Broken Link Checker
        </button>
        <button
          onClick={() => setActiveView('audit_checker')}
          className={`tab-button ${activeView === 'audit_checker' ? 'active' : ''}`}
        >
          🔍 Audit Checker
        </button>
        <button
          onClick={() => setActiveView('links')}
          className={`tab-button ${activeView === 'links' ? 'active' : ''}`}
        >
          🔗 Link Analysis
        </button>
        <button
          onClick={() => setActiveView('tree')}
          className={`tab-button ${activeView === 'tree' ? 'active' : ''}`}
        >
          🌳 Site Structure
        </button>
        <button
          onClick={() => setActiveView('audits')}
          className={`tab-button ${activeView === 'audits' ? 'active' : ''}`}
        >
          🔍 Performance Audits
        </button>
        <button
          onClick={() => setActiveView('schema')}
          className={`tab-button ${activeView === 'schema' ? 'active' : ''}`}
        >
          📝 Schema Generator
        </button>
        <button
          onClick={() => setActiveView('module_e' as any)}
          className={`tab-button ${activeView === ('module_e' as any) ? 'active' : ''}`}
        >
          📊 Module E
        </button>
        <button
          onClick={() => setActiveView('intelligence')}
          className={`tab-button ${activeView === 'intelligence' ? 'active' : ''}`}
        >
          🧠 AI Intelligence
        </button>
        <button
          onClick={() => setActiveView('simulator')}
          className={`tab-button ${activeView === 'simulator' ? 'active' : ''}`}
        >
          🤖 AI Simulator
        </button>
        <button
          onClick={() => setActiveView('content_metrics')}
          className={`tab-button ${activeView === 'content_metrics' ? 'active' : ''}`}
        >
          📄 Content Metrics
        </button>
        <button
          onClick={() => setActiveView('answer_completeness')}
          className={`tab-button ${activeView === 'answer_completeness' ? 'active' : ''}`}
        >
          ✅ Answer Completeness
        </button>
      </div>

      <div className="tab-content">
        {activeView === 'crawler' && (
          <CrawlerContent
            isCrawling={isCrawling}
            crawlStatus={crawlStatus}
            pageCount={pageCount}
            crawlStats={crawlStats}
            logs={logs}
            discoveredPages={discoveredPages}
            crawlStartTime={crawlStartTime}
            currentTime={currentTime}
          />
        )}

        {activeView === 'data' && (
          <div className="data-content-embedded">
            <DataViewer
              onClose={() => { }}
              initialSessionId={effectiveSessionId}
            />
          </div>
        )}

        {activeView === 'page_metrics' && (
          <div className="page-metrics-content-embedded">
            <PageMetrics
              initialSessionId={effectiveSessionId}
            />
          </div>
        )}

        {activeView === 'text_quality_analyzer' && (
          <div className="data-content-embedded">
            <TextQualityAnalyzer initialSessionId={effectiveSessionId} />
          </div>
        )}

        {activeView === 'serp_analysis' && (
          <div className="serp-analysis-content-embedded">
            <SerpAnalysis initialSessionId={effectiveSessionId} />
          </div>
        )}

        {activeView === 'wordcount_analysis' && (
          <div className="wordcount-analysis-content-embedded">
            <WordcountAnalysis
              initialSessionId={effectiveSessionId}
            />
          </div>
        )}

        {activeView === 'broken_links' && (
          <div className="broken-links-content-embedded">
            <BrokenLinkChecker
              initialSessionId={effectiveSessionId}
            />
          </div>
        )}

        {activeView === 'audit_checker' && (
          <div className="audit-checker-content-embedded">
            <AuditChecker
              initialSessionId={effectiveSessionId}
            />
          </div>
        )}

        {activeView === 'links' && (
          <div className="links-content-embedded">
            <LinkExplorer
              onClose={() => { }}
              sessionId={effectiveSessionId}
            />
          </div>
        )}

        {activeView === 'tree' && (
          <div className="tree-content-embedded">
            <MindMapWebTree
              onClose={() => { }}
              sessionId={effectiveSessionId}
            />
          </div>
        )}

        {activeView === 'audits' && <AuditsPage sessionId={effectiveSessionId} />}

        {activeView === 'schema' && (
          <SchemaGenerator
            url={url}
            schemaData={schemaData}
            schemaLoading={schemaLoading}
            schemaError={schemaError}
            copiedSchema={copiedSchema}
            schemaFormat={schemaFormat}
            selectedSchemaType={selectedSchemaType}
            setSchemaFormat={setSchemaFormat}
            setSelectedSchemaType={setSelectedSchemaType}
            generateSchema={generateSchema}
            copySchemaToClipboard={copySchemaToClipboard}
          />
        )}

        {activeView === ('module_e' as any) && (
          <ModuleE
            url={url}
            moduleEScores={moduleEScores}
            moduleELoading={moduleELoading}
            moduleEError={moduleEError}
            competitors={competitors}
          />
        )}

        {activeView === 'intelligence' && (
          <IntelligenceModule
            auditMode={auditMode}
            setAuditMode={setAuditMode}
            sitemapUrl={sitemapUrl}
            setSitemapUrl={setSitemapUrl}
            bulkLoading={bulkLoading}
            bulkResults={bulkResults}
            result={result}
            handleBulkAnalyze={handleBulkAnalyze}
          />
        )}

        {activeView === 'simulator' && (
          <AISimulator
            simulationQuery={simulationQuery}
            setSimulationQuery={setSimulationQuery}
            simulationResults={simulationResults}
            simulationLoading={simulationLoading}
            handleSimulation={handleSimulation}
          />
        )}

        {activeView === 'content_metrics' && (
          <div className="content-metrics-content-embedded">
            <ContentMetrics contentMetrics={contentMetrics} entityMetrics={entityMetrics} />
          </div>
        )}

        {activeView === 'answer_completeness' && (
          <div className="content-metrics-content-embedded">
            <AnswerCompletenessScore completenessData={answerCompletenessData} />
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardTabs;