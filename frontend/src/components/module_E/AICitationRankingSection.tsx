
import React from 'react';
import {
  useRunRankingAnalysisMutation,
  type RankingAnalysisResponse,
  type RankingPositionItem,
  type ModelWiseRow,
  type EntityCoverage,
  type ContentQuality,
} from '../../store/api/module_E/rankingApi';

const MODELS = ['chat_gpt', 'claude', 'gemini'] as const;
const MODEL_LABELS: Record<string, string> = {
  chat_gpt: 'ChatGPT',
  chatgpt: 'ChatGPT',
  openai: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

interface AICitationRankingSectionProps {
  url: string;
  sessionId?: number;
  savedCitationMetrics?: Partial<RankingAnalysisResponse> | null;
}

export const AICitationRankingSection: React.FC<AICitationRankingSectionProps> = ({
  url,
  sessionId,
  savedCitationMetrics,
}) => {
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[AICitationRankingSection] received savedCitationMetrics:', savedCitationMetrics);
    }
  }, [savedCitationMetrics]);
  const [runRankingAnalysis, { data, isLoading, error }] =
    useRunRankingAnalysisMutation();
  const [location, setLocation] = React.useState('');
  const [topicOverride, setTopicOverride] = React.useState('');
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const websiteUrl = (url || '').trim();

  const handleRun = () => {
    if (!websiteUrl) return;
    runRankingAnalysis({
      url: websiteUrl,
      prompts: [],
      sessionId,
      location: location.trim() || undefined,
      topicOverride: topicOverride.trim() || undefined,
    });
  };

  const resp = data as RankingAnalysisResponse | undefined;
  
  // 🔧 FIX: Only consider fresh results valid if they have meaningful data
  const freshHasValidEntityCoverage = resp?.entity_coverage && (
    (resp.entity_coverage.score ?? 0) > 0 || 
    (resp.entity_coverage.found_entities?.length ?? 0) > 0 ||
    (resp.entity_coverage.entities_observed?.length ?? 0) > 0
  );
  
  const hasFreshResults = !!(
    resp?.success && (
      (resp.ranking_position_per_prompt?.length ?? 0) > 0 ||
      (resp.model_wise_comparison?.length ?? 0) > 0 ||
      (resp.percentile_by_prompt && Object.keys(resp.percentile_by_prompt).length > 0) ||
      freshHasValidEntityCoverage  // 🔧 FIX: Only if entity_coverage has real data
    )
  );

  // Consider saved metrics beyond ranking_position_per_prompt — model-wise comparison,
  // percentile_by_prompt, content_quality and entity_coverage should allow the UI to render
  const savedHasRankingRows = (savedCitationMetrics?.ranking_position_per_prompt?.length ?? 0) > 0;
  const savedHasModelWise = (savedCitationMetrics?.model_wise_comparison?.length ?? 0) > 0;
  const savedHasPercentile = !!(savedCitationMetrics?.percentile_by_prompt && Object.keys(savedCitationMetrics.percentile_by_prompt).length > 0);
  const savedHasContentQuality = savedCitationMetrics?.content_quality?.overall_score !== undefined && savedCitationMetrics?.content_quality?.overall_score !== null;
  const savedHasEntityCoverage = savedCitationMetrics?.entity_coverage?.score !== undefined && savedCitationMetrics?.entity_coverage?.score !== null;

  const hasSavedResults = !!(
    !hasFreshResults && (savedHasRankingRows || savedHasModelWise || savedHasPercentile || savedHasContentQuality || savedHasEntityCoverage)
  );

  const hasResults = hasFreshResults || hasSavedResults;

  const displayRows =
    (hasFreshResults ? resp?.ranking_position_per_prompt : null) ??
    savedCitationMetrics?.ranking_position_per_prompt ??
    [];

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[AICitationRankingSection] flags:', { hasFreshResults, savedHasRankingRows, savedHasModelWise, savedHasPercentile, savedHasContentQuality, savedHasEntityCoverage, hasSavedResults, hasResults });
    }
  }, [hasFreshResults, savedHasRankingRows, savedHasModelWise, savedHasPercentile, savedHasContentQuality, savedHasEntityCoverage, hasSavedResults, hasResults]);

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-gray-800 bg-black shadow-lg">
      <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-4 flex items-center gap-2">
        <span className="text-xl">🏆</span>
        <h3 className="text-lg font-semibold text-white">
          AI Citation Ranking
        </h3>
      </div>
      <div className="p-6">
        <p className="text-sm text-gray-400 mb-4">
          Click Run Analysis to see how your URL ranks in AI citations across
          ChatGPT, Claude, and Gemini. Prompts are auto-generated from your
          page content. Add location (e.g. &quot;Surat&quot;, &quot;UAE&quot;) to surface local companies.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={handleRun}
            disabled={!websiteUrl || isLoading}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
          >
            {isLoading ? 'Analyzing...' : 'Run Analysis'}
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            {showAdvanced ? 'Hide' : 'Show'} location & topic
          </button>
          {!websiteUrl && (
            <span className="text-xs text-amber-500">
              Enter a URL above to enable analysis
            </span>
          )}
        </div>

        {showAdvanced && (
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Location (e.g. Surat, UAE)</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Surat, UAE, Spain..."
                className="w-48 rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Topic override (if auto-detected is wrong)</span>
              <input
                type="text"
                value={topicOverride}
                onChange={(e) => setTopicOverride(e.target.value)}
                placeholder="Real Estate AI Chatbots..."
                className="w-56 rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-500"
              />
            </label>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-900/50 border border-red-500 text-red-200 rounded-lg text-sm">
            {((error as any)?.data?.error ?? (error as any)?.message ?? 'Analysis failed')}
          </div>
        )}

        {resp?.errors && resp.errors.length > 0 && (
          <div className="mt-4 p-3 bg-amber-900/30 border border-amber-700 text-amber-200 rounded-lg text-xs">
            Some models failed: {resp.errors.join('; ')}
          </div>
        )}

        {resp?.generated_prompts && resp.generated_prompts.length > 0 && (
          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg text-sm">
            <span className="text-blue-300 font-medium">Prompts used (auto-generated from page content):</span>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
              {resp.generated_prompts.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {hasResults && (
          <div className="mt-8 space-y-8">
            {/* 1. Ranking position per prompt */}
            {Array.isArray(displayRows) && displayRows.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
                  Ranking Position per Prompt
                </h4>
                {hasSavedResults && (
                  <p className="text-xs text-gray-500 mb-2">Saved from previous analysis</p>
                )}
                <div className="overflow-x-auto rounded-lg border border-gray-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-900 text-xs uppercase text-gray-400 font-bold">
                      <tr>
                        <th className="px-4 py-3 border-b border-gray-800">Prompt</th>
                        <th className="px-4 py-3 border-b border-gray-800">Model</th>
                        <th className="px-4 py-3 border-b border-gray-800">Position</th>
                        <th className="px-4 py-3 border-b border-gray-800">Total Cited</th>
                        <th className="px-4 py-3 border-b border-gray-800">Source Diversity</th>
                        <th className="px-4 py-3 border-b border-gray-800">Credibility</th>
                        <th className="px-4 py-3 border-b border-gray-800">Percentile</th>
                        <th className="px-4 py-3 border-b border-gray-800">Content Quality</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {displayRows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-900/50">
                          <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{row.prompt}</td>
                          <td className="px-4 py-3 text-gray-400">{MODEL_LABELS[row.model] ?? row.model}</td>
                          <td className="px-4 py-3">
                            {row.position != null ? (
                              <span className="font-medium text-white">#{row.position}</span>
                            ) : (
                              <span className="text-gray-500">Not cited</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-400">{row.total_cited}</td>
                          <td className="px-4 py-3 text-gray-400">{row.source_diversity != null ? `${row.source_diversity}%` : '—'}</td>
                          <td className="px-4 py-3 text-gray-400">{row.credibility_score != null ? String(row.credibility_score) : '—'}</td>
                          <td className="px-4 py-3">
                            {row.percentile != null ? (
                              <span
                                className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${row.percentile >= 80 ? 'bg-green-900/40 text-green-400' : row.percentile >= 50 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'}`}
                              >
                                {row.percentile}%
                              </span>
                            ) : (<span className="text-gray-500">—</span>)}
                          </td>
                          <td className="px-4 py-3">
                            {row.content_quality_score != null ? (
                              <span
                                className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${row.content_quality_score >= 70 ? 'bg-green-900/40 text-green-400' : row.content_quality_score >= 50 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'}`}
                              >
                                {row.content_quality_score}
                              </span>
                            ) : (<span className="text-gray-500">—</span>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. Percentile rank summary */}
            {(() => {
              const percentileData = (hasFreshResults ? resp?.percentile_by_prompt : null) ?? savedCitationMetrics?.percentile_by_prompt;
              if (!percentileData || Object.keys(percentileData).length === 0) return null;

              return (
                <div>
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Percentile Rank by Model</h4>
                  <div className="overflow-x-auto rounded-lg border border-gray-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-900 text-xs uppercase text-gray-400 font-bold">
                        <tr>
                          <th className="px-4 py-3 border-b border-gray-800">Prompt</th>
                          {MODELS.map((m) => (
                            <th key={m} className="px-4 py-3 border-b border-gray-800">{MODEL_LABELS[m]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {Object.entries(percentileData).map(([prompt, byModel]: [string, any]) => (
                          <tr key={prompt} className="hover:bg-gray-900/50">
                            <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{prompt}</td>
                            {MODELS.map((m) => {
                              const pct = (byModel as any)?.[m];
                              return (
                                <td key={m} className="px-4 py-3">
                                  {pct != null ? (
                                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${pct >= 80 ? 'bg-green-900/40 text-green-400' : pct >= 50 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'}`}>
                                      {pct}%
                                    </span>
                                  ) : (<span className="text-gray-500">—</span>)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* 3. Model-wise ranking comparison */}
            {(() => {
              const modelWiseData = (hasFreshResults ? resp?.model_wise_comparison : null) ?? savedCitationMetrics?.model_wise_comparison;
              if (!Array.isArray(modelWiseData) || modelWiseData.length === 0) return null;

              return (
                <div>
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Model-wise Ranking Comparison</h4>
                  <div className="overflow-x-auto rounded-lg border border-gray-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-900 text-xs uppercase text-gray-400 font-bold">
                        <tr>
                          <th className="px-4 py-3 border-b border-gray-800">Prompt</th>
                          {MODELS.map((m) => (
                            <th key={m} className="px-4 py-3 border-b border-gray-800">{MODEL_LABELS[m]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {modelWiseData.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-900/50">
                            <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{row.prompt}</td>
                            {MODELS.map((m) => {
                              const pos = row[m as keyof ModelWiseRow];
                              return (
                                <td key={m} className="px-4 py-3">
                                  {pos != null ? (<span className="font-medium text-white">#{pos}</span>) : (<span className="text-gray-500">Not cited</span>)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* 4. Content Quality / Completeness */}
            {(() => {
              const qualityData = (hasFreshResults ? resp?.content_quality : null) ?? savedCitationMetrics?.content_quality;
              if (!qualityData || qualityData.overall_score === undefined) return null;

              return (
                <div>
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Content Quality / Completeness</h4>
                  <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">Overall Score</span>
                        <span className={`text-2xl font-bold ${qualityData.overall_score >= 70 ? 'text-green-400' : qualityData.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{qualityData.overall_score}</span>
                      </div>
                    </div>
                    {qualityData.by_prompt_model && Object.keys(qualityData.by_prompt_model).length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-400 mb-2 font-medium">By Prompt & Model:</p>
                        <div className="space-y-2">
                          {Object.entries(qualityData.by_prompt_model).map(([prompt, modelScores]: [string, any]) => (
                            <div key={prompt} className="text-xs">
                              <div className="text-gray-300 font-medium mb-1 truncate max-w-md">{prompt}</div>
                              <div className="flex gap-4 ml-4">
                                {Object.entries(modelScores).map(([model, score]: [string, any]) => (
                                  <div key={model} className="flex items-center gap-1">
                                    <span className="text-gray-500">{MODEL_LABELS[model] ?? model}:</span>
                                    <span className={`font-medium ${score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{score}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* 5. AI Citation Coverage */}
            {(() => {
              // 🔧 FIX: Only use fresh results if they have meaningful data (score > 0 or found entities > 0)
              // Otherwise stick with saved metrics to prevent showing 0% after showing real data
              const freshHasValidData = resp?.entity_coverage && (
                (resp.entity_coverage.score ?? 0) > 0 || 
                (resp.entity_coverage.found_entities?.length ?? 0) > 0 ||
                (resp.entity_coverage.entities_observed?.length ?? 0) > 0
              );
              
              const coverageData = (hasFreshResults && freshHasValidData) 
                ? resp?.entity_coverage 
                : (savedCitationMetrics?.entity_coverage || null);
              if (!coverageData || coverageData.score === undefined) return null;

              // Support both field name formats from API
              let foundEntities = coverageData.found_entities || coverageData.entities_observed || [];
              const missingEntities = coverageData.missing_entities || coverageData.entities_missing || [];
              const expectedEntities = coverageData.entities_expected || [];
              const totalExpected = coverageData.total_expected || expectedEntities.length || 0;
              
              // 🔧 FIX: Deduplicate found entities to prevent "26 of 25" bug
              foundEntities = Array.isArray(foundEntities) ? [...new Set(foundEntities)] : [];

              if (typeof window !== 'undefined') {
                console.log('[AICitationRankingSection] Entity Coverage Data:', {
                  score: coverageData.score,
                  foundCount: foundEntities?.length,
                  missingCount: missingEntities?.length,
                  totalExpected,
                  coverageData
                });
              }

              return (
                <div>
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">AI Citation Coverage</h4>
                  <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">Coverage Score</span>
                        <span className={`text-2xl font-bold ${coverageData.score >= 70 ? 'text-green-400' : coverageData.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{coverageData.score}%</span>
                      </div>
                    </div>
                    {foundEntities && foundEntities.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-400 mb-2 font-medium">✅ Found Entities ({foundEntities.length}):</p>
                        <div className="flex flex-wrap gap-2">
                          {foundEntities.map((entity: string, idx: number) => (
                            <span key={idx} className="px-2 py-1 rounded bg-green-900/30 text-green-300 text-xs border border-green-800">{entity}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {missingEntities && missingEntities.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-400 mb-2 font-medium">❌ Missing Entities ({missingEntities.length}):</p>
                        <div className="flex flex-wrap gap-2">
                          {missingEntities.map((entity: string, idx: number) => (
                            <span key={idx} className="px-2 py-1 rounded bg-red-900/30 text-red-300 text-xs border border-red-800">{entity}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {resp?.success && !hasResults && !isLoading && (
          <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700 text-gray-400 text-sm">
            No citations found for the given prompts. Try different prompts or
            ensure your URL is cited by the models.
          </div>
        )}
      </div>
    </div>
  );
};

export default AICitationRankingSection;
