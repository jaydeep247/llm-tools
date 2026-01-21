import React from 'react';
import './URLInputForm.css';

interface URLInputFormProps {
  url: string;
  setUrl: (url: string) => void;
  loading: boolean;
  stopping: boolean;
  isCrawling?: boolean;
  crawlStatus?: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled';
  runCrawl: boolean;
  setRunCrawl: (value: boolean) => void;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
  runAudits: boolean;
  setRunAudits: (value: boolean) => void;
  auditDevice: 'mobile' | 'desktop';
  setAuditDevice: (device: 'mobile' | 'desktop') => void;
  allowSubdomains: boolean;
  setAllowSubdomains: (value: boolean) => void;
  captureLinkDetails: boolean;
  setCaptureLinkDetails: (value: boolean) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onStop: () => void;
}

export const URLInputForm: React.FC<URLInputFormProps> = ({
  url,
  setUrl,
  loading,
  stopping,
  isCrawling = false,
  crawlStatus = 'idle',
  runCrawl,
  setRunCrawl,
  showAdvanced,
  setShowAdvanced,
  runAudits,
  setRunAudits,
  auditDevice,
  setAuditDevice,
  allowSubdomains,
  setAllowSubdomains,
  captureLinkDetails,
  setCaptureLinkDetails,
  onSubmit,
  onStop
}) => {
  // Determine if any process is active (loading, crawling, or auditing)
  const isProcessActive = loading || isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing';
  
  return (
    <form onSubmit={onSubmit} className="url-input-form">
      <div className="url-input-form-container">
        <div className="url-input-row">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter website URL (e.g., example.com or https://example.com)"
            className="url-input"
            disabled={loading}
            required
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="analyze-button"
          >
            {loading ? (
              <div className="spinner-small"></div>
            ) : (
              <span>🔍</span>
            )}
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={!isProcessActive || stopping}
            className="stop-button"
            title="Stop all ongoing operations"
          >
            {stopping ? (
              <div className="spinner-small"></div>
            ) : (
              <span>🛑</span>
            )}
            {stopping ? 'Stopping...' : 'Stop'}
          </button>
        </div>

        {/* Progress Bar */}
        {loading && (
          <div className="progress-section">
            <div className="progress-bar-container">
              <div className="progress-bar-fill"></div>
            </div>
            <p className="progress-text">
              <svg className="progress-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Fetching backlinks data. Please wait...
            </p>
          </div>
        )}

        {/* Crawl Checkbox */}
        <div className="crawl-checkbox-group">
          <input
            type="checkbox"
            id="runCrawl"
            checked={runCrawl}
            onChange={(e) => setRunCrawl(e.target.checked)}
            className="crawl-checkbox"
            disabled={loading}
          />
          <label htmlFor="runCrawl" className="crawl-checkbox-label">
            🕷️ Run Crawl (Analyze multiple pages)
          </label>
        </div>

        {/* Advanced Options */}
        {runCrawl && (
          <div className="advanced-options-section">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="advanced-toggle-button"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>

            {showAdvanced && (
              <div className="advanced-options-grid">
                <label className="advanced-option-label">
                  <input
                    type="checkbox"
                    checked={runAudits}
                    onChange={(e) => setRunAudits(e.target.checked)}
                    className="advanced-option-checkbox"
                    disabled={loading}
                  />
                  <span className="advanced-option-text">🔍 Run Performance Audits</span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
};
