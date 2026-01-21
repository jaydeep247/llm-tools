import React from 'react';
import './ReuseModal.css';

interface ReusePrompt {
  sessionId: number;
  url: string;
  hasAudits?: boolean;
  auditsTriggered?: boolean;
  auditsInProgress?: boolean;
  message?: string;
}

interface ReuseModalProps {
  reusePrompt: ReusePrompt | null;
  onClose: () => void;
  onViewPrevious: () => void;
  onRecrawl: () => void;
}

export const ReuseModal: React.FC<ReuseModalProps> = ({
  reusePrompt,
  onClose,
  onViewPrevious,
  onRecrawl
}) => {
  if (!reusePrompt) return null;

  return (
    <div
      className="reuse-modal-overlay"
      onClick={onClose}
    >
      <div className="reuse-modal-backdrop"></div>
      <div
        className="reuse-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="Close modal"
          onClick={onClose}
          className="reuse-modal-close-button"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="reuse-modal-header">
          <div className="reuse-modal-header-content">
            <div className="reuse-modal-icon">🔁</div>
            <div>
              <h3 className="reuse-modal-title">Previous crawl found</h3>
              <p className="reuse-modal-subtitle">
                {reusePrompt.message || 'We found a recent crawl for this URL. What would you like to do?'}
              </p>
            </div>
          </div>
          <div className="reuse-modal-url-display">
            <span className="reuse-modal-url-label">URL:</span>
            <span className="reuse-modal-url-value">{reusePrompt.url}</span>
          </div>
          <div className="reuse-modal-badges">
            {reusePrompt.hasAudits && (
              <span className="reuse-modal-badge reuse-modal-badge-success">
                Audits available
              </span>
            )}
            {reusePrompt.auditsInProgress && (
              <span className="reuse-modal-badge reuse-modal-badge-warning">
                Audits in progress
              </span>
            )}
            {reusePrompt.auditsTriggered && !reusePrompt.auditsInProgress && (
              <span className="reuse-modal-badge reuse-modal-badge-info">
                Audits will start
              </span>
            )}
          </div>
        </div>

        <div className="reuse-modal-actions">
          <button
            className="reuse-modal-button reuse-modal-button-primary"
            onClick={onViewPrevious}
          >
            <span>👁️</span>
            <span>View previous</span>
          </button>
          <button
            className="reuse-modal-button reuse-modal-button-secondary"
            onClick={onRecrawl}
          >
            <span>🔄</span>
            <span>Re-crawl now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
