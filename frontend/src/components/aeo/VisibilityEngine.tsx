import React, { useState } from 'react';
import AnswerCompletenessScore from './AnswerCompletenessScore';
import EntityExtractor from './EntityExtractor';
import LLMAnswerSimulator from './LLMAnswerSimulator';
import ActionableInsights from './ActionableInsights';
import EntityCoverageAudit from './EntityCoverageAudit';
import MissingInfoAnalysis from './MissingInfoAnalysis';
import MultiModelComparison from './MultiModelComparison';
import '../../pages/AEODashboard.css';


interface VisibilityEngineProps {
  // Answer Completeness props
  answerCompletenessData?: any;

  // Entity Extractor props
  entityData?: any;

  // LLM Answer Simulator props
  simulatorData?: any;

  // Common props for LLM and Insights
  url?: string;
  sessionId?: number | null;

  // External props (not used internally)
  activeView?: string;
  setActiveView?: (view: string) => void;
}

type VisibilityEngineView = 'answer_completeness' | 'entity_extractor' | 'llm_answer_simulator' | 'actionable_insights' | 'entity_coverage_audit' | 'missing_info_analysis' | 'multi_model_comparison';

const VisibilityEngine: React.FC<VisibilityEngineProps> = (props) => {

  const {
    answerCompletenessData,
    entityData,
    simulatorData,
    url,
    sessionId,
  } = props;

  // Internal state for managing tabs within Visibility Engine
  const [internalActiveView, setInternalActiveView] = useState<VisibilityEngineView>('answer_completeness');

  return (
    <div className="dashboard-tabs">
      {/* Visibility Engine Header */}
      <div className="content-metrics-header" style={{ marginBottom: '2rem' }}>
        <h2>🔍 Visibility Engine</h2>
        <p className="subtitle">Comprehensive analysis toolkit for optimizing your content's search visibility</p>
      </div>

      <div className="tab-navigation">
        {/* Answer Completeness Tab */}
        <button
          onClick={() => setInternalActiveView('answer_completeness')}
          className={`tab-button ${internalActiveView === 'answer_completeness' ? 'active' : ''}`}
        >
          ✅ Answer Completeness
        </button>

        {/* Entity Extractor Tab */}
        <button
          onClick={() => setInternalActiveView('entity_extractor')}
          className={`tab-button ${internalActiveView === 'entity_extractor' ? 'active' : ''}`}
        >
          🏷️ Entity Extractor
        </button>

        {/* LLM Answer Simulator Tab */}
        <button
          onClick={() => setInternalActiveView('llm_answer_simulator')}
          className={`tab-button ${internalActiveView === 'llm_answer_simulator' ? 'active' : ''}`}
        >
          🤖 LLM Simulator
        </button>

        {/* Actionable Insights Tab */}
        <button
          onClick={() => setInternalActiveView('actionable_insights')}
          className={`tab-button ${internalActiveView === 'actionable_insights' ? 'active' : ''}`}
        >
          🎯 Actionable Insights
        </button>

        {/* Entity Coverage Audit Tab */}
        <button
          onClick={() => setInternalActiveView('entity_coverage_audit')}
          className={`tab-button ${internalActiveView === 'entity_coverage_audit' ? 'active' : ''}`}
        >
          🏷️ Entity Coverage
        </button>

        {/* Missing Information Analysis Tab */}
        <button
          onClick={() => setInternalActiveView('missing_info_analysis')}
          className={`tab-button ${internalActiveView === 'missing_info_analysis' ? 'active' : ''}`}
        >
          🔍 Missing Information
        </button>

        {/* Multi-Model Comparison Tab */}
        <button
          onClick={() => setInternalActiveView('multi_model_comparison')}
          className={`tab-button ${internalActiveView === 'multi_model_comparison' ? 'active' : ''}`}
        >
          🤝 Multi-Model Insights
        </button>
      </div>
      {/* Tab Content */}
      <div>
        {internalActiveView === 'answer_completeness' && (
          <div className="content-metrics-content-embedded">
            <AnswerCompletenessScore completenessData={answerCompletenessData} />
          </div>
        )}

        {internalActiveView === 'entity_extractor' && (
          <div className="content-metrics-content-embedded">
            <EntityExtractor entityData={entityData} />
          </div>
        )}

        {internalActiveView === 'llm_answer_simulator' && (
          <div className="content-metrics-content-embedded">
            <LLMAnswerSimulator
              simulatorData={simulatorData}
              url={url}
              sessionId={sessionId || undefined}
            />
          </div>
        )}

        {internalActiveView === 'actionable_insights' && (
          <div className="content-metrics-content-embedded">
            <ActionableInsights
              url={url}
              sessionId={sessionId || undefined}
            />
          </div>
        )}

        {internalActiveView === 'entity_coverage_audit' && (
          <div className="content-metrics-content-embedded">
            <EntityCoverageAudit
              url={url}
              sessionId={sessionId || undefined}
            />
          </div>
        )}

        {internalActiveView === 'missing_info_analysis' && (
          <div className="content-metrics-content-embedded">
            <MissingInfoAnalysis
              url={url}
              sessionId={sessionId || undefined}
            />
          </div>
        )}

        {internalActiveView === 'multi_model_comparison' && (
          <div className="content-metrics-content-embedded">
            <MultiModelComparison url={url} />
          </div>
        )}
      </div>
    </div>



  );

}
export default VisibilityEngine;