import React, { useState, useEffect } from 'react';
import './AEODashboard.css';
import DataViewer from '../crawler/DataViewer';
import LinkExplorer from '../crawler/LinkExplorer';
import WebTree from '../crawler/FixedWebTree';
import AuditsPage from '../audit/AuditsPage';
import { apiService } from '../../api';

interface AEOScore {
  overall: number;
  ai_presence: number;
  competitor_landscape: number;
  strategy_review: number;
  structured_data?: number;
}

interface AIPlatform {
  name: string;
  icon: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
  details?: {
    understanding_level?: string;
    clarity_score?: number;
    key_topics?: string[];
    main_issues?: string[];
    recommendations?: string[];
    bot_accessibility_score?: number;
    understanding_score?: number;
    scoreType?: 'bot_accessibility' | 'ai_understanding' | 'combined';
    [key: string]: any;
  };
}

interface Competitor {
  name: string;
  count: number;
}

interface StrategyMetric {
  name: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
  color: 'green' | 'orange' | 'red';
}

interface AEODashboardProps {
  url?: string;
  result?: any;
  onAnalyze?: (url: string) => void;
  runCrawl?: boolean;
  isCrawling?: boolean;
  crawlStatus?: 'idle' | 'running' | 'auditing' | 'completed';
  pageCount?: number;
  crawlStats?: {
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null;
  logs?: { message: string; timestamp: string }[];
  discoveredPages?: any[];
}

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
  discoveredPages = []
}) => {
  // Added 'simulator' to activeView types
  const [activeView, setActiveView] = useState<'crawler' | 'data' | 'links' | 'tree' | 'audits' | 'schema' | 'intelligence' | 'simulator'>(runCrawl ? 'crawler' : 'data');
  const [showRecommendations, setShowRecommendations] = useState<string | null>(null);
  const [schemaData, setSchemaData] = useState<any>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [schemaFormat, setSchemaFormat] = useState<'json-ld' | 'rdfa'>('json-ld');
  const [selectedSchemaType, setSelectedSchemaType] = useState<string>('auto');

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

  const analyzeWebsiteScores = async () => {
    if (!url) return;
    setModuleELoading(true);
    setModuleEError(null);
    try {
      const response = await fetch('/aeo/website-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, sessionId: result?.session_id })
      });
      const data = await response.json();
      if (data.success) {
        setModuleEScores(data.scores);
      } else {
        setModuleEError(data.error || 'Analysis failed');
      }
    } catch (e: any) {
      setModuleEError(e.message || 'Analysis failed');
    } finally {
      setModuleELoading(false);
    }
  };

  // Load Module E data from result when available
  useEffect(() => {
    console.log('=== AEODashboard: FULL result object ===', JSON.stringify(result, null, 2));

    // Handle both direct result and nested result.results structure
    const actualResult = result?.results || result;

    if (actualResult?.module_scores) {
      // Extract Module E data from result
      const moduleEData = {
        consistency: actualResult.module_scores.consistency,
        entity_coverage: actualResult.entity_coverage,
        brand_metrics: actualResult.module_scores.brand_metrics,
        url: actualResult.url
      };
      setModuleEScores(moduleEData);
    }
  }, [result]);

  const handleSimulation = async () => {
    if (!simulationQuery) return;
    setSimulationLoading(true);
    try {
      const response = await apiService.simulateAnswer(url, simulationQuery);
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
      const response = await apiService.analyzeBulk(cleanedUrl);
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
  const generateSchema = async () => {
    if (!url) return;

    setSchemaLoading(true);
    setSchemaError(null);

    try {
      const response = await fetch('/api/aeo/generate-schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          schema_type: selectedSchemaType
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSchemaData(data.results);
      } else {
        setSchemaError(data.error || 'Failed to generate schema');
      }
    } catch (error: any) {
      setSchemaError(error.message || 'Failed to generate schema');
    } finally {
      setSchemaLoading(false);
    }
  };

  const copySchemaToClipboard = () => {
    const textToCopy = schemaFormat === 'json-ld' ? schemaData?.schema_text : schemaData?.rdfa_markup;
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2000);
    });
  };

  const getModuleRecommendations = (moduleName: string): string[] => {
    if (!result?.detailed_analysis) return [];

    const module = result.detailed_analysis[moduleName];
    return module?.recommendations || [];
  };

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

  const scores: AEOScore = result ? {
    overall: Math.round(result.overall_score || 0),
    ai_presence: Math.round(result.module_scores?.ai_presence || result.detailed_analysis?.ai_presence?.score || 0),
    competitor_landscape: Math.round(result.module_scores?.competitor_analysis || result.detailed_analysis?.competitor_analysis?.score || 0),
    strategy_review: Math.round(
      (
        (result.module_scores?.answerability || 0) +
        (result.module_scores?.knowledge_base || 0) +
        (result.module_scores?.structured_data || 0) +
        (result.module_scores?.crawler_accessibility || 0)
      ) / 4
    ),
    structured_data: Math.round(result.module_scores?.structured_data || result.detailed_analysis?.structured_data?.score || 0)
  } : {
    overall: 0,
    ai_presence: 0,
    competitor_landscape: 0,
    strategy_review: 0,
    structured_data: 0
  };

  const getAIPlatforms = (): AIPlatform[] => {
    if (!result || !result.detailed_analysis?.ai_presence) {
      return [
        { name: 'ChatGPT', icon: '🤖', score: 0, status: 'OFFLINE' },
        { name: 'Gemini', icon: '🧠', score: 0, status: 'OFFLINE' },
        { name: 'Claude', icon: '🎭', score: 0, status: 'OFFLINE' }
      ];
    }

    const aiData = result.detailed_analysis.ai_presence;
    const platforms: AIPlatform[] = [];

    const platformIcons: { [key: string]: string } = {
      'GPTBot': '🤖',
      'ChatGPT': '🤖',
      'chatgpt': '🤖',
      'OpenAI': '🤖',
      'Google-Extended': '🧠',
      'Gemini': '🧠',
      'gemini': '🧠',
      'ClaudeBot': '🎭',
      'Claude': '🎭',
      'claude': '🎭'
    };

    if (aiData.platforms && typeof aiData.platforms === 'object') {
      Object.entries(aiData.platforms).forEach(([name, data]: [string, any]) => {
        const displayName = name === 'GPTBot' ? 'ChatGPT' :
          name === 'Google-Extended' ? 'Gemini' :
            name === 'ClaudeBot' ? 'Claude' : name;

        platforms.push({
          name: displayName,
          icon: platformIcons[name] || platformIcons[displayName] || name.charAt(0).toUpperCase(),
          score: Math.round(data.score || 0),
          status: data.status || 'LIVE',
          details: {
            ...data.details,
            scoreType: data.details?.score_type || 'bot_accessibility'
          }
        });
      });
    }

    if (aiData.ai_understanding && typeof aiData.ai_understanding === 'object') {
      const multiAI = aiData.ai_understanding;

      if (multiAI.openai || multiAI.gemini || multiAI.claude) {
        const aiProviders = [
          { name: 'ChatGPT', key: 'openai', icon: '🤖' },
          { name: 'Gemini', key: 'gemini', icon: '🧠' },
          { name: 'Claude', key: 'claude', icon: '🎭' }
        ];

        aiProviders.forEach(provider => {
          const data = multiAI[provider.key];
          const platformKey = provider.name.toLowerCase();

          if (data && !data.error) {
            const existingIndex = platforms.findIndex(p =>
              p.name.toLowerCase() === platformKey
            );

            if (existingIndex === -1) {
              platforms.push({
                name: provider.name,
                icon: provider.icon,
                score: Math.round(data.score || 0),
                status: 'LIVE',
                details: {
                  understanding_level: data.understanding_level,
                  clarity_score: data.clarity_score,
                  key_topics: data.key_topics,
                  main_issues: data.main_issues,
                  recommendations: data.recommendations,
                  scoreType: 'ai_understanding',
                  ai_understanding_available: true,
                  ai_understanding_score: Math.round(data.score || 0)
                }
              });
            }
          }
        });
      }
    }

    if (platforms.length === 0) {
      return [
        { name: 'ChatGPT', icon: '🤖', score: 0, status: 'OFFLINE' },
        { name: 'Gemini', icon: '🧠', score: 0, status: 'OFFLINE' },
        { name: 'Claude', icon: '🎭', score: 0, status: 'OFFLINE' }
      ];
    }

    return platforms;
  };

  const getCompetitors = (): Competitor[] => {
    if (!result || !result.detailed_analysis?.competitor_analysis) {
      return [
        { name: 'No Data', count: 0 }
      ];
    }

    const compData = result.detailed_analysis.competitor_analysis;

    if (compData.error) {
      return [
        { name: 'Not Configured', count: 0 }
      ];
    }

    if (compData.top_competitors && Array.isArray(compData.top_competitors)) {
      return compData.top_competitors.map((comp: any) => {
        const domain = comp.domain || 'Unknown';
        const count = comp.referring_domains || 0;
        return {
          name: domain,
          count: count
        };
      });
    }

    return [
      { name: 'No Competitors Found', count: 0 }
    ];
  };

  const aiPlatforms = getAIPlatforms();
  const competitors = getCompetitors();

  const getStrategyMetrics = (): StrategyMetric[] => {
    if (!result || !result.module_scores) {
      return [
        { name: 'Answerability', score: 0, status: 'LIVE', color: 'green' },
        { name: 'Knowledge Base', score: 0, status: 'LIVE', color: 'red' },
        { name: 'Structured Data', score: 0, status: 'LIVE', color: 'orange' },
        { name: 'AI Crawler Accessibility', score: 0, status: 'LIVE', color: 'green' }
      ];
    }

    const getColorForScore = (score: number): 'green' | 'orange' | 'red' => {
      if (score >= 70) return 'green';
      if (score >= 40) return 'orange';
      return 'red';
    };

    const metrics: StrategyMetric[] = [];

    if (result.module_scores.answerability !== undefined) {
      const score = Math.round(result.module_scores.answerability);
      metrics.push({
        name: 'Answerability',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    if (result.module_scores.knowledge_base !== undefined) {
      const score = Math.round(result.module_scores.knowledge_base);
      metrics.push({
        name: 'Knowledge Base',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    if (result.module_scores.structured_data !== undefined) {
      const score = Math.round(result.module_scores.structured_data);
      metrics.push({
        name: 'Structured Data',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    if (result.module_scores.crawler_accessibility !== undefined) {
      const score = Math.round(result.module_scores.crawler_accessibility);
      metrics.push({
        name: 'AI Crawler Accessibility',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    return metrics;
  };

  const strategyMetrics = getStrategyMetrics();

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#EF4444';
    return '#6B7280';
  };

  const getScoreText = (score: number) => {
    if (score >= 90) return 'Exceptional! Your Company\'s AEO report obtained an outstanding score. Your company has mastered AI visibility strategies and is prominently featured in AI responses. Our suggestions will help maintain this exceptional performance.';
    if (score >= 70) return 'Good performance! Your AEO score shows strong AI visibility. There are opportunities to optimize further and improve your presence in AI responses.';
    if (score >= 50) return 'Moderate performance. Your AEO score indicates room for improvement in AI visibility strategies.';
    return 'Your AEO score needs attention. Focus on improving AI visibility and structured data implementation.';
  };

  return (
    <div className="aeo-dashboard">

      <div className="overall-section">
        <div className="overall-score">
          <div
            className="score-circle"
            style={{ '--progress': scores.overall } as React.CSSProperties}
          >
            <div className="score-value">{scores.overall}</div>
            <div className="score-total">/100</div>
          </div>
        </div>
        <div className="report-summary">
          <div className="summary-date">
            {result?.analysis_timestamp
              ? new Date(result.analysis_timestamp).toLocaleDateString('en-GB')
              : new Date().toLocaleDateString('en-GB')}
          </div>
          <div className="summary-text">{getScoreText(scores.overall)}</div>
        </div>
      </div>

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <div className="card-header">
            <h3>AI Presence</h3>
            {getModuleRecommendations('ai_presence').length > 0 && (
              <button
                className="info-button"
                onClick={() => setShowRecommendations('ai_presence')}
                title={`View ${getModuleRecommendations('ai_presence').length} recommendations`}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="7" r="0.75" fill="currentColor" />
                </svg>
                <span className="info-badge">{getModuleRecommendations('ai_presence').length}</span>
              </button>
            )}
          </div>
          <div className="card-score">
            <div
              className="score-circle-metric"
              style={{
                '--progress': scores.ai_presence,
                '--color': getScoreColor(scores.ai_presence)
              } as React.CSSProperties}
            >
              <div className="score-value-metric">{scores.ai_presence}</div>
            </div>
          </div>
          <div className="ai-platforms">
            {aiPlatforms.map((platform, index) => (
              <div key={index} className="platform-item">
                <div className="platform-icon" style={{ backgroundColor: platform.status === 'LIVE' ? '#10B981' : '#6B7280' }}>
                  {platform.icon}
                </div>
                <div className="platform-info">
                  <span className="platform-name">{platform.name}</span>
                  <div className="platform-score">
                    <span className="score">{platform.score}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header">
            <h3>Competitor Landscape</h3>
            {getModuleRecommendations('competitor_analysis').length > 0 && (
              <button
                className="info-button"
                onClick={() => setShowRecommendations('competitor_analysis')}
                title={`View ${getModuleRecommendations('competitor_analysis').length} recommendations`}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="7" r="0.75" fill="currentColor" />
                </svg>
                <span className="info-badge">{getModuleRecommendations('competitor_analysis').length}</span>
              </button>
            )}
          </div>
          <div className="card-score">
            <div
              className="score-circle-metric"
              style={{
                '--progress': scores.competitor_landscape,
                '--color': getScoreColor(scores.competitor_landscape)
              } as React.CSSProperties}
            >
              <div className="score-value-metric">{scores.competitor_landscape}</div>
            </div>
          </div>
          <div className="competitor-description">
            {result?.detailed_analysis?.competitor_analysis?.metrics ? (
              <>
                Your domain has <strong>{result.detailed_analysis.competitor_analysis.metrics.total_referring_domains || 0}</strong> referring domains
                with <strong>{result.detailed_analysis.competitor_analysis.metrics.total_individual_backlinks || 0}</strong> total backlinks.
              </>
            ) : (
              'Analyzing your backlink profile and competitive landscape.'
            )}
          </div>
          <div className="competitors-list">
            <div className="competitors-label">Top Referring Domains:</div>
            <div className="competitors-tags">
              {competitors.length > 0 && competitors[0].name !== 'No Data' && competitors[0].name !== 'Not Configured' ? (
                competitors.map((competitor, index) => (
                  <span key={index} className="competitor-tag">
                    <span className="competitor-count">{competitor.count}</span> {competitor.name}
                  </span>
                ))
              ) : (
                <span className="competitor-tag-empty">
                  {competitors[0]?.name === 'Not Configured'
                    ? 'Configure DataForSEO API to see competitor data'
                    : 'No competitor data available'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header">
            <h3>Strategy Review</h3>
            {(getModuleRecommendations('answerability').length > 0 ||
              getModuleRecommendations('knowledge_base').length > 0 ||
              getModuleRecommendations('structured_data').length > 0 ||
              getModuleRecommendations('crawler_accessibility').length > 0) && (
                <button
                  className="info-button"
                  onClick={() => setShowRecommendations('strategy_review')}
                  title={`View ${getModuleRecommendations('answerability').length + getModuleRecommendations('knowledge_base').length + getModuleRecommendations('structured_data').length + getModuleRecommendations('crawler_accessibility').length} recommendations`}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="10" cy="7" r="0.75" fill="currentColor" />
                  </svg>
                  <span className="info-badge">
                    {getModuleRecommendations('answerability').length +
                      getModuleRecommendations('knowledge_base').length +
                      getModuleRecommendations('structured_data').length +
                      getModuleRecommendations('crawler_accessibility').length}
                  </span>
                </button>
              )}
          </div>
          <div className="card-score">
            <div
              className="score-circle-metric"
              style={{
                '--progress': scores.strategy_review,
                '--color': getScoreColor(scores.strategy_review)
              } as React.CSSProperties}
            >
              <div className="score-value-metric">{scores.strategy_review}</div>
            </div>
          </div>
          <div className="strategy-metrics">
            {strategyMetrics.map((metric, index) => (
              <div key={index} className="metric-item">
                <div className="metric-name">{metric.name}</div>
                <div className="metric-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${metric.score}%`,
                        backgroundColor: metric.color === 'green' ? '#10B981' :
                          metric.color === 'orange' ? '#F59E0B' : '#EF4444'
                      }}
                    ></div>
                  </div>
                  <div className="metric-score">
                    <span className="score">{metric.score}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

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
            onClick={() => setActiveView('intelligence')}
            className={`tab-button ${activeView === 'intelligence' ? 'active' : ''}`}
          >
            🧠 AI Intelligence
          </button>
          {/* NEW TAB */}
          <button
            onClick={() => setActiveView('simulator')}
            className={`tab-button ${activeView === 'simulator' ? 'active' : ''}`}
          >
            🤖 AI Simulator
          </button>
          <button
            onClick={() => setActiveView('module_e' as any)}
            className={`tab-button ${activeView === ('module_e' as any) ? 'active' : ''}`}
          >
            📊 Module E
          </button>
        </div>

        <div className="tab-content">
          {activeView === 'crawler' && (
            <div className="crawler-content">
              <div className="crawler-status">
                <div className="status-header">
                  <h3>🕷️ Crawling Status</h3>
                  <div className="status-indicator">
                    <div className={`status-dot ${isCrawling ? 'active' : ''}`}></div>
                    <span>
                      {crawlStatus === 'running' ? 'Crawling...' :
                        crawlStatus === 'auditing' ? 'Auditing...' :
                          'Completed'}
                    </span>
                  </div>
                </div>
                <div className="crawler-stats">
                  <div className="stat-box">
                    <div className="stat-value">{pageCount}</div>
                    <div className="stat-label">Pages Discovered</div>
                  </div>
                  {crawlStats && (
                    <>
                      <div className="stat-box">
                        <div className="stat-value">{crawlStats.duration.toFixed(1)}s</div>
                        <div className="stat-label">Duration</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-value">{crawlStats.pagesPerSecond.toFixed(1)}</div>
                        <div className="stat-label">Items/Sec</div>
                      </div>
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
          )}

          {activeView === 'data' && (
            <div className="data-content-embedded">
              <DataViewer
                onClose={() => { }}
                initialSessionId={result?.session_id || null}
              />
            </div>
          )}

          {activeView === 'links' && (
            <div className="links-content-embedded">
              <LinkExplorer
                onClose={() => { }}
              />
            </div>
          )}

          {activeView === 'tree' && (
            <div className="tree-content-embedded">
              <WebTree
                onClose={() => { }}
              />
            </div>
          )}

          {activeView === 'audits' && <AuditsPage />}

          {activeView === 'schema' && (
            <div className="schema-generator-content">
              <div className="content-header">
                <div>
                  <h3>📝 Schema.org Markup Generator</h3>
                  <p>Generate SEO-optimized Schema.org JSON-LD markup using AI</p>
                </div>
                <button
                  className="action-button primary"
                  onClick={generateSchema}
                  disabled={schemaLoading || !url}
                >
                  {schemaLoading ? '⏳ Generating...' : '✨ Generate Schema'}
                </button>
              </div>

              <div className="schema-type-selector">
                <label htmlFor="schema-type" className="schema-type-label">
                  Select Schema Type:
                </label>
                <select
                  id="schema-type"
                  className="schema-type-dropdown"
                  value={selectedSchemaType}
                  onChange={(e) => setSelectedSchemaType(e.target.value)}
                  disabled={schemaLoading}
                >
                  <option value="auto">🤖 Auto-detect (Recommended)</option>
                  <option value="Organization">🏢 Organization Markup</option>
                  <option value="LocalBusiness">🏪 Local Business Markup</option>
                  <option value="WebPage">📄 WebPage Markup</option>
                  <option value="Article">📰 Article Markup</option>
                  <option value="BlogPosting">✍️ Blog Post Markup</option>
                  <option value="Product">🛍️ Product Markup</option>
                  <option value="Service">⚙️ Service Markup</option>
                  <option value="FAQPage">❓ FAQ Markup</option>
                  <option value="BreadcrumbList">🍞 Breadcrumb Markup</option>
                  <option value="Person">👤 Person Markup</option>
                  <option value="Event">📅 Event Markup</option>
                  <option value="Recipe">🍳 Recipe Markup</option>
                  <option value="HowTo">📖 How To Markup</option>
                  <option value="VideoObject">🎥 Video Markup</option>
                  <option value="ImageObject">🖼️ Image Markup</option>
                  <option value="Course">🎓 Course Markup</option>
                  <option value="JobPosting">💼 Job Posting Markup</option>
                  <option value="Review">⭐ Review Markup</option>
                </select>
              </div>

              {schemaError && (
                <div className="schema-error">
                  <div className="error-icon">⚠️</div>
                  <div>
                    <h4>Error Generating Schema</h4>
                    <p>{schemaError}</p>
                  </div>
                </div>
              )}

              {schemaLoading && (
                <div className="schema-loading">
                  <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Analyzing page content and generating schema markup...</p>
                  </div>
                </div>
              )}

              {schemaData && !schemaLoading && (
                <div className="schema-results">
                  <div className="schema-code-card">
                    <div className="schema-code-header">
                      <div className="schema-header-left">
                        <h4>Schema Markup</h4>
                        <div className="schema-format-toggle">
                          <button
                            className={`format-button ${schemaFormat === 'json-ld' ? 'active' : ''}`}
                            onClick={() => setSchemaFormat('json-ld')}
                          >
                            JSON-LD
                          </button>
                          <button
                            className={`format-button ${schemaFormat === 'rdfa' ? 'active' : ''}`}
                            onClick={() => setSchemaFormat('rdfa')}
                          >
                            RDFa
                          </button>
                        </div>
                      </div>
                      <button
                        className="copy-button"
                        onClick={copySchemaToClipboard}
                      >
                        {copiedSchema ? '✅ Copied!' : '📋 Copy to Clipboard'}
                      </button>
                    </div>
                    <div className="schema-code-container">
                      <pre className="schema-code">
                        <code>{schemaFormat === 'json-ld' ? schemaData.schema_text : schemaData.rdfa_markup}</code>
                      </pre>
                    </div>
                  </div>

                </div>
              )}

              {!schemaData && !schemaLoading && !schemaError && (
                <div className="empty-state">
                  <div className="empty-state-icon">📝</div>
                  <h3>Generate Schema Markup</h3>
                  <p>
                    Click the "Generate Schema" button above to create SEO-optimized Schema.org markup for your page.
                    <br /><br />
                    Our AI will analyze your page content and generate the most appropriate schema type
                    (Article, Product, LocalBusiness, Organization, etc.) with all relevant properties.
                  </p>
                  <div className="empty-state-hint">
                    💡 Make sure your OpenAI API key is configured for AI-powered schema generation
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === ('module_e' as any) && (
            <div className="p-4" style={{ minHeight: 'auto' }}>
              {/* New Summary Table (Replaces Multi-Model Cards) */}
              {moduleEScores && (
                <div className="mb-8 overflow-hidden rounded-xl border border-gray-800 bg-black shadow-lg">
                  <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-4 flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    <h3 className="text-lg font-semibold text-white">Analysis Summary</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                      <thead className="bg-gray-900 text-xs uppercase text-gray-400 font-bold tracking-wider">
                        <tr>
                          <th className="px-6 py-4 border-b border-gray-800">Website Name</th>
                          <th className="px-6 py-4 border-b border-gray-800">Content Consistency</th>
                          <th className="px-6 py-4 border-b border-gray-800">Entity Coverage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        <tr className="hover:bg-gray-900/30 transition-colors">
                          <td className="px-6 py-4 font-medium text-white border-r border-gray-800/50">
                            {url || moduleEScores.url || 'Unknown Website'}
                          </td>
                          <td className="px-6 py-4 border-r border-gray-800/50">
                            <span className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-bold ${(moduleEScores.consistency || 0) >= 80 ? 'bg-green-900/40 text-green-400 border border-green-800' :
                              (moduleEScores.consistency || 0) >= 50 ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-800' :
                                'bg-red-900/40 text-red-400 border border-red-800'
                              }`}>
                              {moduleEScores.consistency !== undefined ? `${moduleEScores.consistency}%` : 'N/A'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-bold ${(moduleEScores.entity_coverage?.score || 0) >= 80 ? 'bg-green-900/40 text-green-400 border border-green-800' :
                              (moduleEScores.entity_coverage?.score || 0) >= 50 ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-800' :
                                'bg-red-900/40 text-red-400 border border-red-800'
                              }`}>
                              {moduleEScores.entity_coverage?.score !== undefined ? `${moduleEScores.entity_coverage.score}%` : 'N/A'}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {moduleELoading && (
                <div className="loading-state text-center p-8 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="spinner mx-auto mb-4 w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-gray-300">Aggregating content and analyzing...</p>
                </div>
              )}

              {moduleEError && (
                <div className="error-message p-4 bg-red-900/50 border border-red-500 text-red-200 rounded-lg mt-4">
                  ❌ Error: {moduleEError}
                </div>
              )}

              {/* Brand Pulse & Sentiment Section (Outside Main Box) */}
              {moduleEScores && moduleEScores.brand_metrics && (
                <div className="mt-8 bg-gray-800 p-6 rounded-xl border border-gray-700">
                  <h4 className="text-xl font-bold mb-4 text-gray-200 flex items-center gap-2">
                    <span>📢</span> Brand Pulse & Sentiment
                    <span className="text-sm font-normal text-gray-400 ml-2">({moduleEScores.brand_metrics.brand_name})</span>
                  </h4>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Sentiment & Mentions */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-4 bg-gray-900/50 p-4 rounded-lg">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-white">{moduleEScores.brand_metrics.total_mentions}</div>
                          <div className="text-xs text-gray-400 uppercase tracking-wider">Total Mentions</div>
                        </div>
                        <div className="h-10 w-px bg-gray-700"></div>
                        <div className="flex-grow">
                          <div className="text-sm text-gray-300 mb-1">Sentiment: <span className="font-bold text-white">{moduleEScores.brand_metrics.sentiment.label}</span></div>
                          <div className="flex h-3 rounded-full overflow-hidden bg-gray-700 w-full">
                            <div style={{ width: `${(moduleEScores.brand_metrics.sentiment.counts.positive / (moduleEScores.brand_metrics.total_mentions || 1)) * 100}%` }} className="bg-green-500 h-full" title="Positive"></div>
                            <div style={{ width: `${(moduleEScores.brand_metrics.sentiment.counts.neutral / (moduleEScores.brand_metrics.total_mentions || 1)) * 100}%` }} className="bg-gray-400 h-full" title="Neutral"></div>
                            <div style={{ width: `${(moduleEScores.brand_metrics.sentiment.counts.negative / (moduleEScores.brand_metrics.total_mentions || 1)) * 100}%` }} className="bg-red-500 h-full" title="Negative"></div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h5 className="text-sm font-bold text-gray-300 uppercase mb-3">Top Mentioning Sites</h5>
                        <div className="space-y-2">
                          {moduleEScores.brand_metrics.top_sources.slice(0, 5).map((source: any, i: number) => (
                            <div key={i} className="flex justify-between items-center text-sm p-2 bg-gray-750 rounded hover:bg-gray-700 transition-colors">
                              <span className="text-blue-400 truncate w-2/3">{source.domain}</span>
                              {source.count !== undefined && (
                                <span className="bg-gray-900 text-gray-300 px-2 py-0.5 rounded text-xs">{source.count}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Frequency Chart */}
                    <div className="flex flex-col h-full">
                      <h5 className="text-sm font-bold text-gray-300 uppercase mb-3 text-center">Mention Frequency (Last 12 Months)</h5>
                      <div className="flex-grow relative h-48 bg-gray-900/30 p-2 rounded-lg border border-gray-700/50">
                        {(() => {
                          const trendData = moduleEScores.brand_metrics!.frequency_trend.slice(-12);
                          const data = trendData.map((p: any) => ({
                            date: new Date(p.date),
                            value: Number(p.count || 0)
                          }));

                          if (data.length === 0 || data.every((d: any) => d.value === 0)) {
                            return (
                              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                                <div className="text-center">
                                  <div className="text-3xl mb-2 opacity-50">📉</div>
                                  <div className="text-xs text-gray-400">No activity recorded</div>
                                </div>
                              </div>
                            );
                          }

                          const yMax = Math.max(...data.map((d: any) => d.value), 5);
                          const width = 100;
                          const height = 100;
                          const padding = 5;
                          const getY = (val: number) => height - padding - ((val / yMax) * (height - (padding * 2)));
                          const getX = (i: number) => (i / (data.length - 1)) * width;

                          let areaPath = `M 0,${height}`;
                          let linePath = ``;

                          data.forEach((d: any, i: number) => {
                            const x = getX(i);
                            const y = getY(d.value);
                            if (i === 0) {
                              linePath += `M ${x},${y}`;
                              areaPath += ` L ${x},${y}`;
                            } else {
                              linePath += ` L ${x},${y}`;
                              areaPath += ` L ${x},${y}`;
                            }
                          });
                          areaPath += ` L ${width},${height} Z`;

                          return (
                            <div className="w-full h-full relative" style={{ minWidth: 0 }}>
                              <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                                <defs>
                                  <linearGradient id="freqGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.6} />
                                    <stop offset="90%" stopColor="#3B82F6" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                {[0.25, 0.5, 0.75, 1].map(tick => (
                                  <line key={tick} x1="0" x2={width} y1={getY(yMax * tick)} y2={getY(yMax * tick)} stroke="#374151" strokeDasharray="2,2" strokeWidth="0.5" />
                                ))}
                                <path d={areaPath} fill="url(#freqGradient)" />
                                <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                                {data.map((d: any, i: number) => (
                                  <circle key={i} cx={getX(i)} cy={getY(d.value)} r={1.5} fill="#fff" stroke="#2563EB" strokeWidth="1" className="hover:r-4 transition-all">
                                    <title>{d.value} mentions in {d.date.toLocaleString('default', { month: 'short' })}</title>
                                  </circle>
                                ))}
                              </svg>
                              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[9px] text-gray-500 transform translate-y-full pt-1">
                                {data.filter((_: any, i: number) => i % 2 === 0).map((d: any, i: number) => (
                                  <span key={i}>{d.date.toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
                                ))}
                              </div>
                              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[8px] text-gray-600 transform translate-y-full pt-3">
                                <span>{data[0].date.getFullYear()}</span>
                                {data[0].date.getFullYear() !== data[data.length - 1].date.getFullYear() && (
                                  <span>{data[data.length - 1].date.getFullYear()}</span>
                                )}
                              </div>
                              <div className="absolute top-0 left-0 -ml-6 text-[9px] text-gray-500">{yMax}</div>
                              <div className="absolute bottom-0 left-0 -ml-6 text-[9px] text-gray-500">0</div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="text-center text-xs text-gray-500 mt-6">Monthly Volume Trend</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === 'intelligence' && (
            <div className="dashboard-card" style={{ padding: '2rem' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h3>🧠 Module C: AI Intelligence Engine</h3>
                <div className="mode-toggle" style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                  <button
                    onClick={() => setAuditMode('single')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      background: auditMode === 'single' ? '#fff' : 'transparent',
                      boxShadow: auditMode === 'single' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      fontWeight: auditMode === 'single' ? '600' : '400',
                      color: auditMode === 'single' ? '#0f172a' : '#64748b',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    AEO Checker
                  </button>
                  <button
                    onClick={() => setAuditMode('bulk')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      background: auditMode === 'bulk' ? '#fff' : 'transparent',
                      boxShadow: auditMode === 'bulk' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      fontWeight: auditMode === 'bulk' ? '600' : '400',
                      color: auditMode === 'bulk' ? '#0f172a' : '#64748b',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    LLM-Friendliness Bulk Audit
                  </button>
                </div>
              </div>

              {auditMode === 'single' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '1rem' }}>

                  {/* 1. Main Score Card (Left) */}
                  <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                    <h4 style={{ color: '#64748b', marginBottom: '1rem', fontWeight: 'bold' }}>LLM-Friendliness Score</h4>
                    <div className="score-circle" style={{
                      '--progress': result?.metrics?.llm_friendliness_score || result?.overall_score || 0,
                      width: '140px',
                      height: '140px',
                      margin: '0 auto'
                    } as React.CSSProperties}>
                      <div className="score-value" style={{ fontSize: '2.5rem' }}>
                        {result?.metrics?.llm_friendliness_score || result?.overall_score || 0}
                      </div>
                    </div>
                    <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#64748b', lineHeight: '1.5' }}>
                      <strong>Strict Analysis:</strong> How easily AI models can understand, trust, and use your content.
                    </p>
                  </div>

                  {/* 2. Strict Metrics List (Right) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* Metric 1: Entity Presence Ratio */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 'bold', color: '#475569' }}>🏷️ Entity Presence Ratio</span>
                        <span style={{ fontWeight: 800, color: '#3b82f6', fontSize: '1.1rem' }}>
                          {result?.metrics?.entity_presence_ratio || 0}%
                        </span>
                      </div>
                      <div className="progress-bar" style={{ height: '8px', background: '#f1f5f9' }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${result?.metrics?.entity_presence_ratio || 0}%`,
                            backgroundColor: (result?.metrics?.entity_presence_ratio || 0) > 70 ? '#10B981' : '#F59E0B'
                          }}
                        ></div>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                        Measures the ratio of key entities found vs. expected.
                      </p>
                    </div>

                    {/* Metric 2: Structured Data Completeness */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 'bold', color: '#475569' }}>🔧 Structured Data Completeness</span>
                        <span style={{ fontWeight: 800, color: '#3b82f6', fontSize: '1.1rem' }}>
                          {result?.metrics?.structured_data_completeness || 0}%
                        </span>
                      </div>
                      <div className="progress-bar" style={{ height: '8px', background: '#f1f5f9' }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${result?.metrics?.structured_data_completeness || 0}%`,
                            backgroundColor: (result?.metrics?.structured_data_completeness || 0) > 80 ? '#10B981' : '#F59E0B'
                          }}
                        ></div>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                        Completeness of Schema.org implementation.
                      </p>
                    </div>

                    {/* Metric 3: Readability Score */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 'bold', color: '#475569' }}>📖 Readability Score</span>
                        <span style={{ fontWeight: 800, color: '#3b82f6', fontSize: '1.1rem' }}>
                          {result?.metrics?.readability_score || 0}
                        </span>
                      </div>
                      <div className="progress-bar" style={{ height: '8px', background: '#f1f5f9' }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${result?.metrics?.readability_score || 0}%`,
                            backgroundColor: (result?.metrics?.readability_score || 0) > 60 ? '#10B981' : '#F59E0B'
                          }}
                        ></div>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                        Flesch-Kincaid Score (Target: 60+ for clear AI parsing).
                      </p>
                    </div>

                  </div>
                </div>
              )}

              {auditMode === 'bulk' && (
                <div className="bulk-audit-container" style={{ marginTop: '2rem' }}>

                  {/* Bulk Input Section */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
                    <input
                      type="text"
                      placeholder="Enter Sitemap URL (e.g. https://firstbud.in/sitemap.xml)"
                      value={sitemapUrl}
                      onChange={(e) => setSitemapUrl(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        color: 'black',
                        fontSize: '1rem'
                      }}
                    />
                    <button
                      onClick={handleBulkAnalyze}
                      disabled={bulkLoading}
                      style={{
                        padding: '12px 24px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#7c3aed',
                        color: 'white',
                        fontWeight: '600',
                        cursor: bulkLoading ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                        opacity: bulkLoading ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      {bulkLoading ? 'Scanning...' : '🚀 Run Bulk Audit'}
                    </button>
                  </div>

                  {/* Loading State */}
                  {bulkLoading && (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                      <div className="spinner" style={{ margin: '0 auto 1rem', width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                      <p>Crawling & Analyzing pages... This may take a while.</p>
                      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    </div>
                  )}

                  {/* Bulk Results */}
                  {bulkResults && !bulkLoading && (
                    <div className="bulk-results">

                      {/* 1. Summary Cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>

                        <div style={{ background: '#f0f9ff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                          <div style={{ fontSize: '0.9rem', color: '#0369a1', marginBottom: '0.5rem', fontWeight: '600' }}>Avg LLM Score</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#0ea5e9' }}>
                            {bulkResults?.summary?.average_llm_score || 0}
                          </div>
                        </div>

                        <div style={{ background: '#f0fdf4', padding: '1.5rem', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                          <div style={{ fontSize: '0.9rem', color: '#15803d', marginBottom: '0.5rem', fontWeight: '600' }}>Avg Readability</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#22c55e' }}>
                            {bulkResults?.summary?.average_readability || 0}
                          </div>
                        </div>

                        <div style={{ background: '#fff7ed', padding: '1.5rem', borderRadius: '12px', border: '1px solid #fed7aa' }}>
                          <div style={{ fontSize: '0.9rem', color: '#c2410c', marginBottom: '0.5rem', fontWeight: '600' }}>Weak Content %</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f97316' }}>
                            {bulkResults?.summary?.weak_content_ratio || 0}%
                          </div>
                        </div>

                        <div style={{ background: '#fff1f2', padding: '1.5rem', borderRadius: '12px', border: '1px solid #fecdd3' }}>
                          <div style={{ fontSize: '0.9rem', color: '#be123c', marginBottom: '0.5rem', fontWeight: '600' }}>Missing Entities %</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f43f5e' }}>
                            {bulkResults?.summary?.missing_entities_ratio || 0}%
                          </div>
                        </div>
                      </div>

                      {/* 2. Detailed Table (UPDATED COLUMNS) */}
                      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', background: 'white' }}>
                          <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <tr>
                              <th style={{ padding: '1rem', textAlign: 'left', color: '#475569', fontWeight: '600' }}>Page URL</th>
                              <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>LLM Score</th>
                              <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Readability</th>
                              {/* FIXED COLUMN: Entity Ratio % */}
                              <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Entity Ratio</th>
                              {/* FIXED COLUMN: Structure % */}
                              <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Structure</th>
                              <th style={{ padding: '1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkResults?.details && bulkResults.details.map((row: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '1rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <a href={row.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '500' }}>
                                    {row.url}
                                  </a>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                  <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    background: (row.llm_score || 0) >= 60 ? '#dcfce7' : '#fee2e2',
                                    color: (row.llm_score || 0) >= 60 ? '#166534' : '#991b1b',
                                    fontWeight: '700',
                                    fontSize: '0.85rem'
                                  }}>
                                    {row.llm_score || 0}
                                  </span>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center', color: '#334155' }}>
                                  {row.readability || 0}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center', color: '#334155' }}>
                                  {/* UPDATED: Display Percentage */}
                                  {row.entities_ratio || 0}%
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center', color: '#334155' }}>
                                  {/* UPDATED: Display Percentage */}
                                  {row.structure_score || 0}%
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                  {row.status === 'Good'
                                    ? <span style={{ color: '#10b981' }}>✅ Good</span>
                                    : <span style={{ color: '#ef4444' }}>⚠️ Weak</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showRecommendations && (
        <div className="recommendations-modal-overlay" onClick={() => setShowRecommendations(null)}>
          <div className="recommendations-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <div className="modal-title-icon">
                  {showRecommendations === 'ai_presence' && '🤖'}
                  {showRecommendations === 'competitor_analysis' && '🎯'}
                  {showRecommendations === 'strategy_review' && '📊'}
                </div>
                <div className="modal-title-section">
                  <h3>
                    {showRecommendations === 'ai_presence' && 'AI Presence Recommendations'}
                    {showRecommendations === 'competitor_analysis' && 'Competitor Analysis Recommendations'}
                    {showRecommendations === 'strategy_review' && 'Strategy Review Recommendations'}
                  </h3>
                  <p className="modal-subtitle">
                    {showRecommendations === 'ai_presence' && 'Improve your AI visibility and presence'}
                    {showRecommendations === 'competitor_analysis' && 'Enhance your competitive positioning'}
                    {showRecommendations === 'strategy_review' && 'Optimize your overall strategy'}
                  </p>
                </div>
              </div>
              <button
                className="close-button"
                onClick={() => setShowRecommendations(null)}
                aria-label="Close modal"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="modal-content">
              {showRecommendations === 'strategy_review' ? (
                <div className="strategy-recommendations">
                  {getModuleRecommendations('answerability').length > 0 && (
                    <div className="module-section">
                      <div className="module-section-header">
                        <span className="module-icon">❓</span>
                        <h4>Answerability</h4>
                      </div>
                      <div className="recommendations-list">
                        {getModuleRecommendations('answerability').map((rec, index) => {
                          const priority = getRecommendationPriority(rec);
                          return (
                            <div key={index} className={`recommendation-item priority-${priority}`}>
                              <div className="recommendation-icon-wrapper">
                                <div className="recommendation-icon">💡</div>
                              </div>
                              <div className="recommendation-content">
                                <div className="recommendation-header">
                                  <span className={`priority-badge priority-${priority}`}>
                                    {priority.toUpperCase()}
                                  </span>
                                  <span className="recommendation-priority-label">
                                    {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                                  </span>
                                </div>
                                <div className="recommendation-text">{rec}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {getModuleRecommendations('knowledge_base').length > 0 && (
                    <div className="module-section">
                      <div className="module-section-header">
                        <span className="module-icon">📚</span>
                        <h4>Knowledge Base</h4>
                      </div>
                      <div className="recommendations-list">
                        {getModuleRecommendations('knowledge_base').map((rec, index) => {
                          const priority = getRecommendationPriority(rec);
                          return (
                            <div key={index} className={`recommendation-item priority-${priority}`}>
                              <div className="recommendation-icon-wrapper">
                                <div className="recommendation-icon">💡</div>
                              </div>
                              <div className="recommendation-content">
                                <div className="recommendation-header">
                                  <span className={`priority-badge priority-${priority}`}>
                                    {priority.toUpperCase()}
                                  </span>
                                  <span className="recommendation-priority-label">
                                    {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                                  </span>
                                </div>
                                <div className="recommendation-text">{rec}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {getModuleRecommendations('structured_data').length > 0 && (
                    <div className="module-section">
                      <div className="module-section-header">
                        <span className="module-icon">🔧</span>
                        <h4>Structured Data</h4>
                      </div>
                      <div className="recommendations-list">
                        {getModuleRecommendations('structured_data').map((rec, index) => {
                          const priority = getRecommendationPriority(rec);
                          return (
                            <div key={index} className={`recommendation-item priority-${priority}`}>
                              <div className="recommendation-icon-wrapper">
                                <div className="recommendation-icon">💡</div>
                              </div>
                              <div className="recommendation-content">
                                <div className="recommendation-header">
                                  <span className={`priority-badge priority-${priority}`}>
                                    {priority.toUpperCase()}
                                  </span>
                                  <span className="recommendation-priority-label">
                                    {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                                  </span>
                                </div>
                                <div className="recommendation-text">{rec}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {getModuleRecommendations('crawler_accessibility').length > 0 && (
                    <div className="module-section">
                      <div className="module-section-header">
                        <span className="module-icon">🕷️</span>
                        <h4>Crawler Accessibility</h4>
                      </div>
                      <div className="recommendations-list">
                        {getModuleRecommendations('crawler_accessibility').map((rec, index) => {
                          const priority = getRecommendationPriority(rec);
                          return (
                            <div key={index} className={`recommendation-item priority-${priority}`}>
                              <div className="recommendation-icon-wrapper">
                                <div className="recommendation-icon">💡</div>
                              </div>
                              <div className="recommendation-content">
                                <div className="recommendation-header">
                                  <span className={`priority-badge priority-${priority}`}>
                                    {priority.toUpperCase()}
                                  </span>
                                  <span className="recommendation-priority-label">
                                    {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                                  </span>
                                </div>
                                <div className="recommendation-text">{rec}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {(() => {
                    const moduleName = showRecommendations === 'ai_presence' ? 'AI Presence' :
                      showRecommendations === 'competitor_analysis' ? 'Competitor Analysis' : '';
                    const moduleIcon = showRecommendations === 'ai_presence' ? '🤖' :
                      showRecommendations === 'competitor_analysis' ? '🎯' : '';
                    const recommendations = getModuleRecommendations(showRecommendations);

                    if (recommendations.length === 0) {
                      return (
                        <div className="no-recommendations">
                          <div className="no-recommendations-icon">📝</div>
                          <div className="no-recommendations-text">
                            No recommendations available for this module.
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="module-section">
                        {moduleName && (
                          <div className="module-section-header">
                            <span className="module-icon">{moduleIcon}</span>
                            <h4>{moduleName}</h4>
                          </div>
                        )}
                        <div className="recommendations-list">
                          {recommendations.map((rec, index) => {
                            const priority = getRecommendationPriority(rec);
                            return (
                              <div key={index} className={`recommendation-item priority-${priority}`}>
                                <div className="recommendation-icon-wrapper">
                                  <div className="recommendation-icon">💡</div>
                                </div>
                                <div className="recommendation-content">
                                  <div className="recommendation-header">
                                    <span className={`priority-badge priority-${priority}`}>
                                      {priority.toUpperCase()}
                                    </span>
                                    <span className="recommendation-priority-label">
                                      {priority === 'high' ? 'Critical' : priority === 'medium' ? 'Important' : 'Minor'}
                                    </span>
                                  </div>
                                  <div className="recommendation-text">{rec}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Multi-Model Website Scoring - Temporarily Disabled */}
      {/* 
      {false && activeView === ('module_e' as any) && (
        <div className="module-e-content" style={{ padding: '20px' }}>
          <div className="card-header">
            <h3 className="text-xl font-bold mb-4">Multi-Model Website Scoring</h3>
          </div>
          <p style={{ marginBottom: '20px', color: '#9CA3AF' }}>
            Analyze a qualified content aggregation of your website using three top-tier models independently.
          </p>

          {!moduleEScores && !moduleELoading && (
            <button
              onClick={analyzeWebsiteScores}
              className="generate-btn px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold flex items-center gap-2"
            >
              <span>🚀</span> Run Multi-Model Analysis
            </button>
          )}

          {moduleELoading && (
            <div className="loading-state text-center p-8 bg-gray-800 rounded-lg border border-gray-700">
              <div className="spinner mx-auto mb-4 w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-300">Aggregating content and analyzing with OpenAI, Claude, and Gemini...</p>
            </div>
          )}

          {moduleEError && (
            <div className="error-message p-4 bg-red-900/50 border border-red-500 text-red-200 rounded-lg mt-4">
              ❌ Error: {moduleEError}
            </div>
          )}

          {moduleEScores && (
            <div className="scores-grid grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              
              <div className="score-card bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center hover:border-green-500 transition-colors">
                <div className="text-5xl mb-4">🤖</div>
                <h4 className="text-xl font-bold mb-4 text-gray-200">ChatGPT-4o</h4>
                <div className="relative w-24 h-24 flex items-center justify-center rounded-full" style={{ background: `conic-gradient(#10B981 ${moduleEScores.openai * 3.6}deg, #374151 0deg)` }}>
                  <div className="absolute w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{moduleEScores.openai}</span>
                  </div>
                </div>
              </div>

              
              <div className="score-card bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center hover:border-amber-500 transition-colors">
                <div className="text-5xl mb-4">🎭</div>
                <h4 className="text-xl font-bold mb-4 text-gray-200">Claude 3.5</h4>
                <div className="relative w-24 h-24 flex items-center justify-center rounded-full" style={{ background: `conic-gradient(#F59E0B ${moduleEScores.claude * 3.6}deg, #374151 0deg)` }}>
                  <div className="absolute w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{moduleEScores.claude}</span>
                  </div>
                </div>
              </div>

              
              <div className="score-card bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center hover:border-blue-500 transition-colors">
                <div className="text-5xl mb-4">🧠</div>
                <h4 className="text-xl font-bold mb-4 text-gray-200">Gemini Pro</h4>
                <div className="relative w-24 h-24 flex items-center justify-center rounded-full" style={{ background: `conic-gradient(#3B82F6 ${moduleEScores.gemini * 3.6}deg, #374151 0deg)` }}>
                  <div className="absolute w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{moduleEScores.gemini}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )} 
      */}



      {/* Brand Pulse & Sentiment Section (Outside Main Box) */}
      {activeView === ('module_e' as any) && moduleEScores && moduleEScores.brand_metrics && (
        <div className="mt-8 bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h4 className="text-xl font-bold mb-4 text-gray-200 flex items-center gap-2">
            <span>📢</span> Brand Pulse & Sentiment
            <span className="text-sm font-normal text-gray-400 ml-2">({moduleEScores.brand_metrics.data?.brand_name})</span>
          </h4>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Sentiment & Mentions */}
            <div className="space-y-6">
              <div className="flex items-center gap-4 bg-gray-900/50 p-4 rounded-lg">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">{moduleEScores.brand_metrics.data?.total_mentions}</div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Total Mentions</div>
                </div>
                <div className="h-10 w-px bg-gray-700"></div>
                <div className="flex-grow">
                  {moduleEScores.brand_metrics.data?.sentiment ? (
                    <>
                      <div className="text-sm text-gray-300 mb-1">Sentiment: <span className="font-bold text-white">{moduleEScores.brand_metrics.data.sentiment.label}</span></div>
                      <div className="flex h-3 rounded-full overflow-hidden bg-gray-700 w-full">
                        <div style={{ width: `${(moduleEScores.brand_metrics.data.sentiment.counts.positive / (moduleEScores.brand_metrics.data.total_mentions || 1)) * 100}%` }} className="bg-green-500 h-full" title="Positive"></div>
                        <div style={{ width: `${(moduleEScores.brand_metrics.data.sentiment.counts.neutral / (moduleEScores.brand_metrics.data.total_mentions || 1)) * 100}%` }} className="bg-gray-400 h-full" title="Neutral"></div>
                        <div style={{ width: `${(moduleEScores.brand_metrics.data.sentiment.counts.negative / (moduleEScores.brand_metrics.data.total_mentions || 1)) * 100}%` }} className="bg-red-500 h-full" title="Negative"></div>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-400">Sentiment data not available</div>
                  )}
                </div>
              </div>

              <div>
                <h5 className="text-sm font-bold text-gray-300 uppercase mb-3">Top Mentioning Sites</h5>
                <div className="space-y-2">
                  {moduleEScores.brand_metrics.data?.top_sources ? moduleEScores.brand_metrics.data.top_sources.slice(0, 5).map((source: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-sm p-2 bg-gray-750 rounded hover:bg-gray-700 transition-colors">
                      <span className="text-blue-400 truncate w-2/3">{source.domain}</span>
                      {source.count !== undefined && (
                        <span className="bg-gray-900 text-gray-300 px-2 py-0.5 rounded text-xs">{source.count}</span>
                      )}
                    </div>
                  )) : (
                    <div className="text-sm text-gray-400">No source data available</div>
                  )}
                </div>
              </div>
            </div>

            {/* Frequency Chart */}
            <div className="flex flex-col h-full">
              <h5 className="text-sm font-bold text-gray-300 uppercase mb-3 text-center">Mention Frequency (Last 12 Months)</h5>
              <div className="flex-grow relative h-48 bg-gray-900/30 p-2 rounded-lg border border-gray-700/50">
                {(() => {
                  if (!moduleEScores.brand_metrics?.data?.frequency_trend) {
                    return <div className="absolute inset-0 flex items-center justify-center text-gray-500">Frequency data not available</div>;
                  }
                  const trendData = moduleEScores.brand_metrics.data.frequency_trend.slice(-12);
                  const data = trendData.map((p: any) => ({
                    date: new Date(p.date),
                    value: Number(p.count || 0)
                  }));

                  if (data.length === 0 || data.every((d: any) => d.value === 0)) {
                    return (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                        <div className="text-center">
                          <div className="text-3xl mb-2 opacity-50">📉</div>
                          <div className="text-xs text-gray-400">No activity recorded</div>
                        </div>
                      </div>
                    );
                  }

                  const yMax = Math.max(...data.map((d: any) => d.value), 5);
                  const width = 100;
                  const height = 100;
                  const padding = 5;
                  const getY = (val: number) => height - padding - ((val / yMax) * (height - (padding * 2)));
                  const getX = (i: number) => (i / (data.length - 1)) * width;

                  let areaPath = `M 0,${height}`;
                  let linePath = ``;

                  data.forEach((d: any, i: number) => {
                    const x = getX(i);
                    const y = getY(d.value);
                    if (i === 0) {
                      linePath += `M ${x},${y}`;
                      areaPath += ` L ${x},${y}`;
                    } else {
                      linePath += ` L ${x},${y}`;
                      areaPath += ` L ${x},${y}`;
                    }
                  });
                  areaPath += ` L ${width},${height} Z`;

                  return (
                    <div className="w-full h-full relative" style={{ minWidth: 0 }}>
                      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                        <defs>
                          <linearGradient id="freqGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.6} />
                            <stop offset="90%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        {[0.25, 0.5, 0.75, 1].map(tick => (
                          <line key={tick} x1="0" x2={width} y1={getY(yMax * tick)} y2={getY(yMax * tick)} stroke="#374151" strokeDasharray="2,2" strokeWidth="0.5" />
                        ))}
                        <path d={areaPath} fill="url(#freqGradient)" />
                        <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                        {data.map((d: any, i: number) => (
                          <circle key={i} cx={getX(i)} cy={getY(d.value)} r={1.5} fill="#fff" stroke="#2563EB" strokeWidth="1" className="hover:r-4 transition-all">
                            <title>{d.value} mentions in {d.date.toLocaleString('default', { month: 'short' })}</title>
                          </circle>
                        ))}
                      </svg>
                      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[9px] text-gray-500 transform translate-y-full pt-1">
                        {data.filter((_: any, i: number) => i % 2 === 0).map((d: any, i: number) => (
                          <span key={i}>{d.date.toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
                        ))}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[8px] text-gray-600 transform translate-y-full pt-3">
                        <span>{data[0].date.getFullYear()}</span>
                        {data[0].date.getFullYear() !== data[data.length - 1].date.getFullYear() && (
                          <span>{data[data.length - 1].date.getFullYear()}</span>
                        )}
                      </div>
                      <div className="absolute top-0 left-0 -ml-6 text-[9px] text-gray-500">{yMax}</div>
                      <div className="absolute bottom-0 left-0 -ml-6 text-[9px] text-gray-500">0</div>
                    </div>
                  );
                })()}
              </div>
              <div className="text-center text-xs text-gray-500 mt-6">Monthly Volume Trend</div>
            </div>
          </div>


        </div >
      )}

    </div >
  );
};

export default AEODashboard;