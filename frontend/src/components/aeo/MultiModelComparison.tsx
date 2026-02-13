import React, { useState } from 'react';
import '../../pages/AEODashboard.css';

interface MultiModelComparisonProps {
  className?: string;
  url?: string;  // URL prop passed from parent instead of separate input
}

interface ComparisonResult {
  normalizedPrompt: string;
  responses: {
    openai: string;
    groq: string;
    gemini: string;
  };
  agreement: {
    outcomeLevel: {
      agreement: 'same' | 'compatible' | 'contradictory';
      score: number;
    };
    reasoningLevel: {
      similarity: number;
      approach: 'same' | 'different' | 'shallow_vs_detailed';
    };
    specificityLevel: {
      depthScore: number;
      completenessScore: number;
      exampleCount: number;
    };
    toneAnalysis: {
      confidence: 'hedged' | 'moderate' | 'assertive';
      riskPosture: 'cautious' | 'neutral' | 'aggressive';
    };
  };
  claimMatrix: Array<{
    claim: string;
    providers: {
      openai: boolean;
      groq: boolean;
      gemini: boolean;
    };
    category: string;
    importance: number;
  }>;
  coverageGaps: Array<{
    type: string;
    description: string;
    missingFrom: string[];
    presentIn: string[];
    severity: 'low' | 'medium' | 'high';
  }>;
  scores: {
    openai: {
      agreement: number;
      depth: number;
      actionability: number;
      assumptionsStated: number;
      overall: number;
    };
    groq: {
      agreement: number;
      depth: number;
      actionability: number;
      assumptionsStated: number;
      overall: number;
    };
    gemini: {
      agreement: number;
      depth: number;
      actionability: number;
      assumptionsStated: number;
      overall: number;
    };
  };
  metadata: {
    sourceUrl: string;
    processedAt: string;
    processingTime: number;
  };
}

const MultiModelComparison: React.FC<MultiModelComparisonProps> = ({ className, url }) => {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'responses' | 'claims' | 'gaps' | 'scores'>('overview');
  const [hasAutoAnalyzed, setHasAutoAnalyzed] = useState(false);

  // Coverage Gaps Tab State
  const [selectedGapModel, setSelectedGapModel] = useState<'openai' | 'groq' | 'gemini'>('openai');
  const [selectedImpactFilter, setSelectedImpactFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // Responses Tab State
  const [selectedResponseModel, setSelectedResponseModel] = useState<'openai' | 'groq' | 'gemini'>('openai');

  // ... (rest of the component logic until the return) ...
  // (I will use replace_file_content with a larger block to ensure context is correct)

  const handleCompare = async () => {
    if (!url || !url.trim()) {
      setError('No URL provided. Please enter a URL in the main dashboard input field.');
      return;
    }

    if (!question.trim()) {
      setError('Please enter a custom question to analyze the models.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceUrl: url,
          question: question.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setResult(data.data);
      } else {
        throw new Error(data.error || 'Comparison failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatScore = (score: number) => {
    return (score * 100).toFixed(1) + '%';
  };

  const getAgreementColor = (agreement: string) => {
    switch (agreement) {
      case 'same': return 'text-green-600';
      case 'compatible': return 'text-yellow-600';
      case 'contradictory': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-300 bg-red-900/20 border-red-500/30';
      case 'medium': return 'text-yellow-300 bg-yellow-900/20 border-yellow-500/30';
      case 'low': return 'text-green-300 bg-green-900/20 border-green-500/30';
      default: return 'text-gray-300 bg-gray-900/20 border-gray-500/30';
    }
  };

  // Calculate Coverage Percentage
  const calculateCoverage = (provider: 'openai' | 'groq' | 'gemini') => {
    if (!result || result.claimMatrix.length === 0) return 0;
    const coveredClaims = result.claimMatrix.filter(c => c.providers[provider]).length;
    return (coveredClaims / result.claimMatrix.length) * 100;
  };

  // Filter Gaps for Selected Model
  const getGapsForModel = (provider: string) => {
    if (!result) return [];
    return result.coverageGaps.filter(gap => gap.missingFrom.includes(provider));
  };

  return (
    <div className={`multi-model-comparison ${className || ''}`}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-4">Multi-Model LLM Comparison</h2>
        <p className="text-gray-300 mb-4">
          Compare responses from OpenAI, Groq, and Gemini to analyze answer variation, consistency, and coverage gaps.
        </p>
      </div>

      {/* Analysis Form */}
      <div className="bg-black/30 p-6 rounded-lg shadow-sm border border-purple-500/20 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Analysis Question <span className="text-purple-400">*</span>
            </label>
            <textarea
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (error && e.target.value.trim()) setError(null);
              }}
              placeholder="What specific aspect would you like the models to analyze?"
              rows={3}
              className="w-full px-3 py-2 border border-gray-600 bg-black/20 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
              disabled={loading}
            />
          </div>
          <button
            onClick={handleCompare}
            disabled={loading || !question.trim()}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Comparing Models...
              </>
            ) : (
              result ? 'Re-run Analysis' : 'Compare Models'
            )}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 text-red-300 p-4 rounded-lg mb-6">
          <div className="flex items-start">
            <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="font-medium mb-1">Comparison Failed</h4>
              <p className="text-sm">{error}</p>
              {(error.includes('API key') || error.includes('credit balance') || error.includes('model not found')) && (
                <div className="mt-3 p-3 bg-black/20 rounded border border-white/10">
                  <p className="font-medium text-sm mb-2">Quick Fixes:</p>
                  <ul className="text-xs space-y-1">
                    {error.includes('API key') && (
                      <li>• Ensure API keys are set in backend .env file</li>
                    )}
                    {error.includes('credit balance') && (
                      <li>• Add credits to your Anthropic account at console.anthropic.com/account/billing</li>
                    )}
                    {error.includes('model not found') && (
                      <li>• Check if the model name has been updated in the provider documentation</li>
                    )}
                    {error.includes('Need at least 2 valid') && (
                      <li>• At least 2 out of 3 LLM services must be working for comparison</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="border-b border-white/20">
            <nav className="-mb-px flex space-x-8">
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'responses', label: 'Responses' },
                { key: 'claims', label: 'Claims Matrix' },
                { key: 'gaps', label: 'Coverage Gaps' },
                { key: 'scores', label: 'Model Scores' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === tab.key
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Agreement Analysis */}
              <div className="bg-black/30 p-6 rounded-lg shadow-sm border border-purple-500/20">
                <h3 className="text-lg font-semibold text-white mb-4">Agreement Analysis</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Outcome Agreement:</span>
                    <span className={`font-medium capitalize ${getAgreementColor(result.agreement.outcomeLevel.agreement)}`}>
                      {result.agreement.outcomeLevel.agreement} ({formatScore(result.agreement.outcomeLevel.score)})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Reasoning Similarity:</span>
                    <span className="font-medium text-white">{formatScore(result.agreement.reasoningLevel.similarity)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Depth Score:</span>
                    <span className="font-medium text-white">{formatScore(result.agreement.specificityLevel.depthScore)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Confidence Level:</span>
                    <span className="font-medium capitalize text-white">{result.agreement.toneAnalysis.confidence}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Risk Posture:</span>
                    <span className="font-medium capitalize text-white">{result.agreement.toneAnalysis.riskPosture}</span>
                  </div>
                </div>
              </div>

              {/* Processing Info */}
              <div className="bg-black/30 p-6 rounded-lg shadow-sm border border-purple-500/20">
                <h3 className="text-lg font-semibold text-white mb-4">Processing Info</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Processing Time:</span>
                    <span className="font-medium">{(result.metadata.processingTime / 1000).toFixed(2)}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Claims Found:</span>
                    <span className="font-medium">{result.claimMatrix.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Coverage Gaps:</span>
                    <span className="font-medium">{result.coverageGaps.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Example Count:</span>
                    <span className="font-medium">{result.agreement.specificityLevel.exampleCount}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Responses Tab */}
          {activeTab === 'responses' && (
            <div className="bg-black/30 rounded-lg shadow-sm border border-purple-500/20 overflow-hidden">
              {/* Internal Model Tabs for Responses */}
              <div className="flex border-b border-white/10">
                {(['openai', 'groq', 'gemini'] as const).map((model) => (
                  <button
                    key={model}
                    onClick={() => setSelectedResponseModel(model)}
                    className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${selectedResponseModel === model
                      ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      }`}
                  >
                    <span className="capitalize">{model}</span>
                  </button>
                ))}
              </div>

              <div className="p-6 bg-black/20">
                <div className="bg-white/5 p-6 rounded-xl border border-white/10 shadow-inner">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                    <h3 className="text-lg font-bold text-white capitalize flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>
                      {selectedResponseModel} Response
                    </h3>
                    <span className="text-[10px] px-2 py-1 bg-purple-900/30 text-purple-300 rounded-md font-bold uppercase border border-purple-500/20 tracking-wider">
                      FULL CONTENT
                    </span>
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {result.responses[selectedResponseModel]}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Claims Matrix Tab */}
          {activeTab === 'claims' && (
            <div className="bg-black/30 rounded-lg shadow-sm border border-purple-500/20 overflow-hidden">
              <div className="p-6 border-b border-white/20">
                <h3 className="text-lg font-semibold text-white">Claims Coverage Matrix</h3>
                <p className="text-sm text-gray-600 mt-1">Shows which claims are mentioned by each model</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Claim</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">OpenAI</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Groq</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Gemini</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Importance</th>
                    </tr>
                  </thead>
                  <tbody className="bg-black/20 divide-y divide-white/10">
                    {result.claimMatrix.map((claim, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-black/20' : 'bg-black/30'}>
                        <td className="px-6 py-4 text-sm text-white">{claim.claim}</td>
                        <td className="px-6 py-4 text-center">
                          {claim.providers.openai ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {claim.providers.groq ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {claim.providers.gemini ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 capitalize">{claim.category}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{formatScore(claim.importance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Coverage Gaps Tab */}
          {activeTab === 'gaps' && (
            <div className="bg-black/30 rounded-lg shadow-sm border border-purple-500/20 overflow-hidden">
              {/* Internal Model Tabs with Percentage Badges */}
              <div className="flex border-b border-white/10">
                {(['openai', 'groq', 'gemini'] as const).map((model) => {
                  const coverage = calculateCoverage(model);
                  return (
                    <button
                      key={model}
                      onClick={() => {
                        setSelectedGapModel(model);
                        // Reset impact filter when changing model to ensure a fresh view
                        // setSelectedImpactFilter('all'); 
                      }}
                      className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${selectedGapModel === model
                        ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                    >
                      <span className="capitalize">{model}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${selectedGapModel === model
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                        : 'bg-white/5 border-white/10 text-gray-500'
                        }`}>
                        {coverage.toFixed(0)}%
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="p-6 bg-black/20">
                {/* Secondary Impact Filtering Tabs */}
                <div className="flex items-center gap-2 mb-6 p-1 bg-black/40 rounded-lg w-fit border border-white/5">
                  {(['all', 'high', 'medium', 'low'] as const).map((impact) => {
                    const count = result.coverageGaps.filter(g =>
                      g.presentIn.includes(selectedGapModel) &&
                      (impact === 'all' || g.severity === impact)
                    ).length;

                    return (
                      <button
                        key={impact}
                        onClick={() => setSelectedImpactFilter(impact)}
                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${selectedImpactFilter === impact
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          }`}
                      >
                        <span className="capitalize">{impact} Impact</span>
                        {count > 0 && (
                          <span className={`text-[10px] px-1.5 bg-black/30 rounded-full font-black ${selectedImpactFilter === impact ? 'text-white' : 'text-gray-500'
                            }`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>
                      {selectedGapModel.toUpperCase()} Coverage
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Highlighting information successfully captured by <span className="capitalize text-purple-400 font-bold">{selectedGapModel}</span>{selectedImpactFilter !== 'all' && ` with ${selectedImpactFilter} impact`}.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {result.coverageGaps.filter(g =>
                    g.presentIn.includes(selectedGapModel) &&
                    (selectedImpactFilter === 'all' || g.severity === selectedImpactFilter)
                  ).length === 0 ? (
                    <div className="col-span-full bg-white/5 border border-white/10 p-12 rounded-2xl text-center border-dashed">
                      <span className="text-6xl mb-6 block opacity-20">🔍</span>
                      <p className="text-gray-400 font-bold text-lg">No matching insights found</p>
                      <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
                        {selectedImpactFilter === 'all'
                          ? `This model didn't capture any information that others missed.`
                          : `There are no ${selectedImpactFilter} impact insights for this model.`
                        }
                      </p>
                    </div>
                  ) : (
                    result.coverageGaps
                      .filter(gap =>
                        gap.presentIn.includes(selectedGapModel) &&
                        (selectedImpactFilter === 'all' || gap.severity === selectedImpactFilter)
                      )
                      .map((gap, index) => (
                        <div key={index} className={`p-5 rounded-2xl border flex flex-col transition-all duration-300 hover:scale-[1.02] hover:bg-white/5 hover:border-white/20 group relative overflow-hidden ${getSeverityColor(gap.severity)}`}>
                          {/* Top accent line */}
                          <div className={`absolute top-0 left-0 right-0 h-1 opacity-50 ${gap.severity === 'high' ? 'bg-red-500' :
                            gap.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                            }`}></div>

                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-bold capitalize text-base tracking-tight leading-tight pr-4">{gap.type.replace('_', ' ')}</h4>
                            <span className={`px-2 py-0.5 text-[8px] font-black rounded-md uppercase border whitespace-nowrap ${getSeverityColor(gap.severity)}`}>
                              {gap.severity}
                            </span>
                          </div>

                          <p className="text-sm mb-5 leading-relaxed opacity-80 text-gray-200 line-clamp-3 group-hover:line-clamp-none">
                            {gap.description}
                          </p>

                          <div className="mt-auto pt-4 border-t border-white/5 flex flex-col gap-3">
                            <div>
                              <span className="text-[10px] uppercase text-gray-500 font-black tracking-widest block mb-1">Missing From</span>
                              <div className="flex flex-wrap gap-1">
                                {gap.missingFrom.map(m => (
                                  <span key={m} className="text-[9px] px-2 py-0.5 bg-red-900/30 text-red-300 rounded-md font-bold uppercase border border-red-500/20">
                                    {m}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[9px] font-black text-green-400 tracking-tighter uppercase flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                Captured by {selectedGapModel}
                              </span>
                              <span className="text-[10px] text-gray-500 italic opacity-50">
                                Insight captured
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Model Scores Tab */}
          {activeTab === 'scores' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(result.scores).map(([provider, scores]) => (
                <div key={provider} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 capitalize">{provider}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-800">Agreement:</span>
                      <span className="font-medium text-gray-700">{formatScore(scores.agreement)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-800">Depth:</span>
                      <span className="font-medium text-gray-700">{formatScore(scores.depth)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-800">Actionability:</span>
                      <span className="font-medium text-gray-700">{formatScore(scores.actionability)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-800">Assumptions:</span>
                      <span className="font-medium text-gray-700">{formatScore(scores.assumptionsStated)}</span>
                    </div>
                    <div className="pt-2 border-t border-white/20">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-800">Overall:</span>
                        <span className="font-bold text-purple-400">{formatScore(scores.overall)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiModelComparison;