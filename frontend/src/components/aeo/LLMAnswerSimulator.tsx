import React, { useState, useEffect } from 'react';
import { 
  useGetSimulatorStatsQuery, 
  useAnalyzeContentMutation,
  useFetchUrlContentMutation
} from '../../store/api/module_C/llmAnswerSimulatorApi';
import '../../pages/AEODashboard.css';

interface LLMAnswer {
  query: string;
  answer: string;
  confidence: number;
  sources: string[];
  timestamp: string;
}

interface SimulatorMetrics {
  totalQueries: number;
  averageConfidence: number;
  sourceCoverage: number;
  answerQuality: number;
  recentAnswers: LLMAnswer[];
  overallScore: number;
}

interface LLMAnswerSimulatorProps {
  simulatorData?: SimulatorMetrics;
  pageContent?: string;
  sessionId?: number;
  url?: string;  // Add URL prop to fetch content
}

const LLMAnswerSimulator: React.FC<LLMAnswerSimulatorProps> = ({
  simulatorData,
  pageContent,
  sessionId,
  url
}) => {
  const [showAllAnswers, setShowAllAnswers] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState('');
  const [localData, setLocalData] = useState<SimulatorMetrics | null>(simulatorData || null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);

  const { data: statsData, isLoading: statsLoading } = useGetSimulatorStatsQuery();
  const [analyzeContent, { data: analysisData, isLoading: analysisLoading, error: analysisError }] = useAnalyzeContentMutation();
  const [fetchUrlContent, { isLoading: urlFetching, error: urlError }] = useFetchUrlContentMutation();

  // Common queries that might be asked about a webpage
  const commonQueries = [
    "What is this company's main service?",
    "Who are the key people in this organization?",
    "Where is this business located?",
    "What products do they offer?",
    "How can I contact them?",
    "What is their pricing model?",
    "What makes them different from competitors?",
    "What are their customer reviews?",
  ];

  // Auto-analyze content on mount if no data provided
  useEffect(() => {
    const shouldFetchUrl = url && !pageContent && !fetchedContent && !hasAnalyzed && !urlFetching && !analysisLoading;

    if (shouldFetchUrl) {
      console.log('Fetching content from URL:', url);
      fetchUrlContent({ url })
        .unwrap()
        .then((result) => {
          if (result.success && result.content) {
            console.log('URL content fetched successfully');
            setFetchedContent(result.content);
            setHasAnalyzed(false); // Trigger analysis in next useEffect
          }
        })
        .catch((error) => {
          console.error('Error fetching URL:', error);
          setHasAnalyzed(true); // Prevent infinite retries
        });
    }
  }, [url, pageContent, fetchedContent, hasAnalyzed, urlFetching, analysisLoading, fetchUrlContent]);

  // Auto-analyze content once fetched
  useEffect(() => {
    const shouldAnalyze = !simulatorData && !localData && !hasAnalyzed && !analysisLoading;
    const contentToUse = pageContent || fetchedContent;

    console.log('Analysis check:', {
      shouldAnalyze,
      hasPageContent: !!pageContent,
      hasFetchedContent: !!fetchedContent,
      contentLength: contentToUse?.length || 0,
      simulatorDataExists: !!simulatorData,
      localDataExists: !!localData,
      hasAnalyzed,
      analysisLoading
    });

    if (shouldAnalyze && contentToUse) {
      console.log('Starting analysis with content length:', contentToUse.length);
      console.log('Content preview:', contentToUse.substring(0, 200) + '...');

      analyzeContent({
        content: contentToUse,
        queries: commonQueries // Send all 8 queries instead of just the first 5
      }).unwrap()
        .then((response) => {
          console.log('Analysis successful:', response);
          setHasAnalyzed(true);
          if (response.success && response.data) {
            setLocalData(response.data);
          } else {
            console.error('Analysis response not successful:', response);
          }
        })
        .catch((error) => {
          console.error('Analysis failed:', error);
          setHasAnalyzed(true);
        });
    } else if (shouldAnalyze && !contentToUse) {
      console.log('No content available for simulator analysis');
    }
  }, [pageContent, fetchedContent, simulatorData, localData, hasAnalyzed, analysisLoading, analyzeContent]);

  // Update local data when analysis completes
  useEffect(() => {
    if (analysisData?.success && analysisData.data) {
      console.log('Setting local data from analysis:', analysisData.data);
      setLocalData(analysisData.data);
    }
  }, [analysisData]);

  // Update local data when simulatorData prop changes
  useEffect(() => {
    if (simulatorData) {
      console.log('Setting local data from props:', simulatorData);
      setLocalData(simulatorData);
    }
  }, [simulatorData]);

  const handleSimulateQuery = async () => {
    if (!selectedQuery) return;

    const contentToAnalyze = pageContent || fetchedContent;
    
    if (!contentToAnalyze) {
      console.error('No content available for query simulation');
      alert('No content available for analysis. Please provide a URL or page content.');
      return;
    }

    try {
      console.log('Simulating query with real content:', selectedQuery);
      console.log('Content length:', contentToAnalyze.length);
      const result = await analyzeContent({
        content: contentToAnalyze,
        queries: [selectedQuery]
      }).unwrap();

      console.log('Query simulation result:', result);

      if (result.success && result.data) {
        setLocalData(result.data);
        setSelectedQuery('');
      }
    } catch (error) {
      console.error('Error simulating query:', error);
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    return '#EF4444';
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 50) return 'Needs Improvement';
    return 'Poor';
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return '#10B981';
    if (confidence >= 0.6) return '#F59E0B';
    return '#EF4444';
  };

  const currentData = localData || simulatorData;

  // Error state
  if (analysisError) {
    return (
      <div className="content-metrics-container">
        <div className="content-metrics-header">
          <h2>LLM Answer Simulator - "What AI Would Say"</h2>
          <p className="subtitle">Simulating how AI models would answer common questions about your content...</p>
        </div>
        <div className="no-data-message">
          <div style={{ color: '#EF4444', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
              Error Loading Simulator Data
            </p>
            <p style={{ marginBottom: '16px' }}>
              Please check your API configuration and try again.
            </p>
            <button
              onClick={() => {
                setHasAnalyzed(false);
                setLocalData(null);
              }}
              style={{
                padding: '10px 20px',
                cursor: 'pointer',
                backgroundColor: '#7C3AED',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Retry Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (analysisLoading || (statsLoading && !currentData)) {
    return (
      <div className="content-metrics-container">
        <div className="content-metrics-header">
          <h2>LLM Answer Simulator - "What AI Would Say"</h2>
          <p className="subtitle">Simulating how AI models would answer common questions about your content...</p>
        </div>
        <div className="no-data-message">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '24px', animation: 'spin 1s linear infinite' }}><img src="https://loading.io/spinner/earth/-earth-globe-map-rotate" alt="⭕" /></div>
            <p>Generating AI responses to common queries... This may take a few moments.</p>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (!currentData) {
    return (
      <div className="content-metrics-container">
        <div className="content-metrics-header">
          <h2>LLM Answer Simulator - "What AI Would Say"</h2>
          <p className="subtitle">Simulating how AI models would answer common questions about your content...</p>
        </div>
        <div className="no-data-message">
          <div style={{ textAlign: 'center' }}>
            {urlFetching ? (
              <>
                <div style={{ fontSize: '24px', animation: 'spin 1s linear infinite', marginBottom: '12px' }}>🌎</div>
                <p style={{ fontSize: '16px', marginBottom: '16px' }}>Fetching content from URL...</p>
              </>
            ) : analysisLoading ? (
              <>
                <div style={{ fontSize: '24px', animation: 'spin 1s linear infinite', marginBottom: '12px' }}><img src="https://loading.io/spinner/earth/-earth-globe-map-rotate" alt="⭕" /></div>
                <p style={{ fontSize: '16px', marginBottom: '16px' }}>Analyzing your content with AI...</p>
              </>
            ) : urlError ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                <p style={{ fontSize: '16px', marginBottom: '16px', color: '#EF4444' }}>
                  Error fetching URL: {urlError instanceof Error ? urlError.message : 'Failed to fetch content'}
                </p>
              </>
            ) : analysisError ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                <p style={{ fontSize: '16px', marginBottom: '16px', color: '#EF4444' }}>
                  Error analyzing content. Please try again.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                <p style={{ fontSize: '16px', marginBottom: '16px' }}>
                  {url ? 'Preparing to analyze content from your URL...' : 'Please provide a URL to analyze content.'}
                </p>
                {!url && (
                  <p style={{ fontSize: '14px', color: '#9CA3AF', textAlign: 'center' }}>
                    To get real AI insights, please provide a website URL for analysis.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const {
    totalQueries = 0,
    averageConfidence = 0,
    sourceCoverage = 0,
    answerQuality = 0,
    recentAnswers = [],
    overallScore = 0
  } = currentData;

  return (
    <div className="content-metrics-container">
      <div className="content-metrics-header">
        <h2>LLM Answer Simulator - "What AI Would Say"</h2>
        <p className="subtitle">Analysis of how AI models would respond to common questions about your content</p>
      </div>

      {/* Primary Metrics Grid */}
      
      {/* Answer Quality Breakdown */}
      <div className="entity-types-section">
        <div className="section-header">
          <h3>📊 Answer Quality Breakdown</h3>
          <p className="subtitle">Detailed analysis of AI response quality factors</p>
        </div>

        <div className="entity-types-grid">
          {/* Total Queries Processed */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>❓</div>
              <div className="entity-type-info">
                <h4>Queries Processed</h4>
                <p className="entity-count">{totalQueries} questions</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: '#3B82F6',
                  width: `${Math.min(100, (totalQueries / 10) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Average Confidence */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>🎯</div>
              <div className="entity-type-info">
                <h4>Average Confidence</h4>
                <p className="entity-count">{Math.round(averageConfidence * 100)}% confident</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: getConfidenceColor(averageConfidence),
                  width: `${Math.round(averageConfidence * 100)}%`
                }}
              />
            </div>
          </div>

          {/* Source Coverage */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>📚</div>
              <div className="entity-type-info">
                <h4>Source Coverage</h4>
                <p className="entity-count">{sourceCoverage}% coverage</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: getScoreColor(sourceCoverage),
                  width: `${sourceCoverage}%`
                }}
              />
            </div>
          </div>

          {/* Accuracy */}
           <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>✅</div>
              <div className="entity-type-info">
                <h4>Accuracy</h4>
                <p className="entity-count">{answerQuality}% score</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: getScoreColor(answerQuality),
                  width: `${answerQuality}%`
                }}
              />
            </div>
          </div>

          {/* Completeness */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>📖</div>
              <div className="entity-type-info">
                <h4>Completeness</h4>
                <p className="entity-count">{sourceCoverage}% coverage</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: getScoreColor(sourceCoverage),
                  width: `${sourceCoverage}%`
                }}
              />
            </div>
          </div>

          {/* Relevance */}
          <div className="entity-type-card">
            <div className="entity-type-header">
              <div style={{ fontSize: '20px', marginRight: '12px' }}>🎯</div>
              <div className="entity-type-info">
                <h4>Relevance</h4>
                <p className="entity-count">{Math.round(averageConfidence * 100)}% relevant</p>
              </div>
            </div>
            <div className="entity-type-progress">
              <div
                className="entity-progress-bar"
                style={{
                  backgroundColor: getConfidenceColor(averageConfidence),
                  width: `${Math.round(averageConfidence * 100)}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>


      {/* Query Simulator & Recent AI Answers - Merged Section */}
<div className="entity-types-section">
  <div className="section-header">
    <h3>🤔 Query Simulator</h3>
    <p className="subtitle">Test how AI would respond to common questions about your content</p>
  </div>

  <div className="query-simulator-controls" style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
    <select
      value={selectedQuery}
      onChange={(e) => setSelectedQuery(e.target.value)}
      className="query-select"
      style={{
        flex: 1,
        padding: '10px',
        borderRadius: '6px',
        border: '1px solid #374151',
        fontSize: '14px',
        backgroundColor: '#1F2937',
        color: '#E5E7EB'
      }}
    >
      <option value="">Select a common query...</option>
      {commonQueries.map((query, index) => (
        <option key={index} value={query}>{query}</option>
      ))}
    </select>
    <button
      className="simulate-button"
      disabled={!selectedQuery || analysisLoading}
      onClick={handleSimulateQuery}
      style={{
        padding: '10px 20px',
        backgroundColor: !selectedQuery || analysisLoading ? '#4B5563' : '#7C3AED',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: !selectedQuery || analysisLoading ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'background-color 0.2s'
      }}
    >
      {analysisLoading ? 'Simulating...' : 'Simulate Response'}
    </button>
  </div>

  {/* Empty state - Before query selection */}
  {!selectedQuery && recentAnswers.length === 0 && !analysisLoading && (
    <div style={{
      padding: '32px 20px',
      textAlign: 'center',
      backgroundColor: '#111827',
      border: '1px solid #374151',
      borderRadius: '8px',
      color: '#9CA3AF'
    }}>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
      <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '500' }}>
        Select a query to begin
      </p>
      <p style={{ margin: 0, fontSize: '13px', opacity: 0.7 }}>
        Choose a common question above and click "Simulate Response" to see how AI would answer
      </p>
    </div>
  )}

  {/* Loading state - Show only during simulation */}
  {analysisLoading && selectedQuery && (
    <div style={{
      padding: '24px 20px',
      textAlign: 'center',
      backgroundColor: '#111827',
      border: '1px solid #374151',
      borderRadius: '8px'
    }}>
      <div style={{ fontSize: '24px', animation: 'spin 1s linear infinite', marginBottom: '12px' }}>
        🔄
      </div>
      <p style={{ color: '#D1D5DB', margin: 0, fontSize: '14px' }}>
        Generating AI response to: <strong>"{selectedQuery}"</strong>
      </p>
      <p style={{ color: '#9CA3AF', margin: '4px 0 0 0', fontSize: '12px' }}>
        This may take a few moments...
      </p>
    </div>
  )}

  {/* Recent AI Answers - Show only after simulation */}
  {recentAnswers.length > 0 && selectedQuery && !analysisLoading && (
    <>
      <div className="section-header" style={{ marginBottom: '12px', marginTop: '0px' }}>
        <h3>💬 Simulated Response</h3>
        <p className="subtitle">AI model's answer to your selected query</p>
      </div>

      <div className="answers-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {recentAnswers
          .filter(answer => answer.query === selectedQuery)
          .slice(-1)
          .map((answer, index) => (
            <div key={index} className="answer-badge" style={{
              padding: '14px',
              backgroundColor: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              borderLeft: `4px solid ${getConfidenceColor(answer.confidence)}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '500', marginBottom: '3px' }}>
                    Query
                  </div>
                  <div style={{ fontSize: '13px', color: '#F3F4F6', fontWeight: '600' }}>
                    {answer.query}
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginLeft: '12px' }}>
                  <div style={{
                    fontSize: '11px',
                    color: getConfidenceColor(answer.confidence),
                    fontWeight: '600',
                    backgroundColor: getConfidenceColor(answer.confidence) === '#10B981' ? '#064E3B' :
                      getConfidenceColor(answer.confidence) === '#F59E0B' ? '#78350F' : '#7F1D1D',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap'
                  }}>
                    {Math.round(answer.confidence * 100)}% confidence
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '10px', paddingTop: '10px', borderTop: '1px solid #374151' }}>
                <div style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '500', marginBottom: '3px' }}>
                  Answer
                </div>
                <p style={{ fontSize: '13px', color: '#D1D5DB', lineHeight: '1.5', margin: 0 }}>
                  {answer.answer}
                </p>
              </div>

              {answer.sources && answer.sources.length > 0 && (
                <div style={{ paddingTop: '10px', borderTop: '1px solid #374151' }}>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '500', marginBottom: '6px' }}>
                    Sources
                  </div>
                  <ul style={{
                    margin: 0,
                    paddingLeft: '18px',
                    color: '#9CA3AF',
                    fontSize: '12px'
                  }}>
                    {answer.sources.map((source, sourceIndex) => (
                      <li key={sourceIndex} style={{ marginBottom: '2px' }}>{source}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #374151' }}>
                {new Date(answer.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
      </div>

      {/* Try another query button */}
      <div style={{ marginTop: '12px', textAlign: 'center' }}>
        <button
          onClick={() => {
            setSelectedQuery('');
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#7C3AED',
            cursor: 'pointer',
            padding: '6px 12px',
            fontSize: '13px',
            textDecoration: 'underline',
            borderRadius: '4px',
            transition: 'background-color 0.2s',
            fontWeight: '500'
          }}
          onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#1F2937'}
          onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
        >
          ↺ Try Another Query
        </button>
      </div>
    </>
  )}
</div>

      {/* Insights and Recommendations */}
      <div className="entity-insights-section">
        <div className="section-header">
          <h3>💡 AI Understanding Insights</h3>
          <p className="subtitle">Key insights about how well AI models understand your content</p>
        </div>

        <div className="insights-grid">
          <div className="insight-card">
            <h4>🤖 AI Model Comprehension</h4>
            <p>
              Your content demonstrates <strong>{totalQueries}</strong> answerable questions.
              This indicates solid AI model comprehension of your content structure.
            </p>
          </div>

          <div className="insight-card">
            <h4>📊 Response Reliability</h4>
            <p>
              Average confidence of <strong>{Math.round(averageConfidence * 100)}%</strong> shows
              that AI responses are {averageConfidence >= 0.8 ? 'highly' : averageConfidence >= 0.6 ? 'moderately' : 'reasonably'} reliable.
            </p>
          </div>

          <div className="insight-card">
            <h4>⚙️ Content Optimization</h4>
            <p>
              {overallScore >= 80
                ? "Excellent! Your content is optimized for AI understanding and generates high-quality responses."
                : overallScore >= 60
                  ? "Good foundation. Consider enhancing content clarity for improved AI comprehension."
                  : "Room for improvement. Add more specific details to help AI generate better answers."
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LLMAnswerSimulator;