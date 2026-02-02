import React from 'react';
import {
  useRunRankingAnalysisMutation,
  type RankingAnalysisResponse,
  type RankingPositionItem,
  type ModelWiseRow,
} from '../../store/api/module_E/rankingApi';

const MODELS = ['chat_gpt', 'claude', 'gemini', 'perplexity'] as const;
const MODEL_LABELS: Record<string, string> = {
  chat_gpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

interface AICitationRankingSectionProps {
  url: string;
}

export const AICitationRankingSection: React.FC<AICitationRankingSectionProps> = ({
  url,
}) => {
  const [runRankingAnalysis, { data, isLoading, error }] =
    useRunRankingAnalysisMutation();

  const websiteUrl = (url || '').trim();

  const handleRun = () => {
    if (!websiteUrl) return;
    runRankingAnalysis({ url: websiteUrl, prompts: [] });
  };

  const resp = data as RankingAnalysisResponse | undefined;
  const hasResults = resp?.success && (
    (resp.ranking_position_per_prompt?.length ?? 0) > 0 ||
    (resp.model_wise_comparison?.length ?? 0) > 0
  );

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
          ChatGPT, Claude, Gemini, and Perplexity. Prompts are auto-generated
          from your page content.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRun}
            disabled={!websiteUrl || isLoading}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
          >
            {isLoading ? 'Analyzing...' : 'Run Analysis'}
          </button>
          {!websiteUrl && (
            <span className="text-xs text-amber-500">
              Enter a URL above to enable analysis
            </span>
          )}
        </div>

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
            <span className="text-blue-300 font-medium">Auto-generated prompts:</span>{' '}
            <span className="text-gray-400">{resp.generated_prompts.join(' • ')}</span>
          </div>
        )}

        {hasResults && (
          <div className="mt-8 space-y-8">
            {/* 1. Ranking position per prompt */}
            {resp.ranking_position_per_prompt &&
              resp.ranking_position_per_prompt.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
                    Ranking Position per Prompt
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-gray-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-900 text-xs uppercase text-gray-400 font-bold">
                        <tr>
                          <th className="px-4 py-3 border-b border-gray-800">
                            Prompt
                          </th>
                          <th className="px-4 py-3 border-b border-gray-800">
                            Model
                          </th>
                          <th className="px-4 py-3 border-b border-gray-800">
                            Position
                          </th>
                          <th className="px-4 py-3 border-b border-gray-800">
                            Total Cited
                          </th>
                          <th className="px-4 py-3 border-b border-gray-800">
                            Percentile
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {(resp.ranking_position_per_prompt as RankingPositionItem[]).map(
                          (row, i) => (
                            <tr key={i} className="hover:bg-gray-900/50">
                              <td className="px-4 py-3 text-gray-300 max-w-xs truncate">
                                {row.prompt}
                              </td>
                              <td className="px-4 py-3 text-gray-400">
                                {MODEL_LABELS[row.model] ?? row.model}
                              </td>
                              <td className="px-4 py-3">
                                {row.position != null ? (
                                  <span className="font-medium text-white">
                                    #{row.position}
                                  </span>
                                ) : (
                                  <span className="text-gray-500">Not cited</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-400">
                                {row.total_cited}
                              </td>
                              <td className="px-4 py-3">
                                {row.percentile != null ? (
                                  <span
                                    className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${
                                      row.percentile >= 80
                                        ? 'bg-green-900/40 text-green-400'
                                        : row.percentile >= 50
                                        ? 'bg-yellow-900/40 text-yellow-400'
                                        : 'bg-red-900/40 text-red-400'
                                    }`}
                                  >
                                    {row.percentile}%
                                  </span>
                                ) : (
                                  <span className="text-gray-500">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            {/* 2. Percentile rank summary */}
            {resp.percentile_by_prompt &&
              Object.keys(resp.percentile_by_prompt).length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
                    Percentile Rank by Model
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-gray-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-900 text-xs uppercase text-gray-400 font-bold">
                        <tr>
                          <th className="px-4 py-3 border-b border-gray-800">
                            Prompt
                          </th>
                          {MODELS.map((m) => (
                            <th
                              key={m}
                              className="px-4 py-3 border-b border-gray-800"
                            >
                              {MODEL_LABELS[m]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {Object.entries(resp.percentile_by_prompt).map(
                          ([prompt, byModel]) => (
                            <tr key={prompt} className="hover:bg-gray-900/50">
                              <td className="px-4 py-3 text-gray-300 max-w-xs truncate">
                                {prompt}
                              </td>
                              {MODELS.map((m) => {
                                const pct = byModel[m];
                                return (
                                  <td key={m} className="px-4 py-3">
                                    {pct != null ? (
                                      <span
                                        className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${
                                          pct >= 80
                                            ? 'bg-green-900/40 text-green-400'
                                            : pct >= 50
                                            ? 'bg-yellow-900/40 text-yellow-400'
                                            : 'bg-red-900/40 text-red-400'
                                        }`}
                                      >
                                        {pct}%
                                      </span>
                                    ) : (
                                      <span className="text-gray-500">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            {/* 3. Model-wise ranking comparison */}
            {resp.model_wise_comparison &&
              resp.model_wise_comparison.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
                    Model-wise Ranking Comparison
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-gray-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-900 text-xs uppercase text-gray-400 font-bold">
                        <tr>
                          <th className="px-4 py-3 border-b border-gray-800">
                            Prompt
                          </th>
                          {MODELS.map((m) => (
                            <th
                              key={m}
                              className="px-4 py-3 border-b border-gray-800"
                            >
                              {MODEL_LABELS[m]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {(resp.model_wise_comparison as ModelWiseRow[]).map(
                          (row, i) => (
                            <tr key={i} className="hover:bg-gray-900/50">
                              <td className="px-4 py-3 text-gray-300 max-w-xs truncate">
                                {row.prompt}
                              </td>
                              {MODELS.map((m) => {
                                const pos = row[m as keyof ModelWiseRow];
                                return (
                                  <td key={m} className="px-4 py-3">
                                    {pos != null ? (
                                      <span className="font-medium text-white">
                                        #{pos}
                                      </span>
                                    ) : (
                                      <span className="text-gray-500">
                                        Not cited
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </div>
        )}

        {resp?.success && !hasResults && (
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
