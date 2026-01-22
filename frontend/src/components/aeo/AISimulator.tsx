import React from 'react';

interface AISimulatorProps {
  simulationQuery: string;
  setSimulationQuery: (query: string) => void;
  simulationResults: any;
  simulationLoading: boolean;
  handleSimulation: () => void;
}

const AISimulator: React.FC<AISimulatorProps> = ({
  simulationQuery,
  setSimulationQuery,
  simulationResults,
  simulationLoading,
  handleSimulation
}) => {
  return (
    <div className="ai-simulator-content">
      <div className="simulator-header">
        <h3>🤖 AI Answer Simulator</h3>
        <p>Test how AI models would answer queries about your website</p>
      </div>
      
      <div className="simulator-form">
        <div className="form-group">
          <input
            type="text"
            placeholder="Enter a query to test..."
            value={simulationQuery}
            onChange={(e) => setSimulationQuery(e.target.value)}
            className="simulator-input"
          />
          <button
            onClick={handleSimulation}
            disabled={simulationLoading || !simulationQuery}
            className="simulator-button"
          >
            {simulationLoading ? '🔄 Simulating...' : '🚀 Simulate Answer'}
          </button>
        </div>
      </div>

      {simulationLoading && (
        <div className="simulator-loading">
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
          <p>Generating AI simulation...</p>
        </div>
      )}

      {simulationResults && !simulationLoading && (
        <div className="simulation-results">
          <h4>Simulation Results</h4>
          <div className="results-content">
            <pre>{JSON.stringify(simulationResults, null, 2)}</pre>
          </div>
        </div>
      )}

      {!simulationResults && !simulationLoading && (
        <div className="empty-state">
          <div className="empty-icon">🤖</div>
          <p>Enter a query above to simulate how AI would answer questions about your website.</p>
        </div>
      )}
    </div>
  );
};

export default AISimulator;