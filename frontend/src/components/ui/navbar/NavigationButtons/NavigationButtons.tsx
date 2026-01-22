import React from 'react';
import './NavigationButtons.css';

interface NavigationButtonsProps {
  currentView?: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
}

export const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  currentView,
  onNavigate,
  onLogout
}) => {
  const isActive = (path: string) => {
    return currentView === path || currentView === `/${path}` || currentView?.includes(path);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className={`nav-btn ${isActive('dashboard') ? 'nav-btn-active' : ''}`}
      >
        <span className="btn-icon">📊</span>
        <span>Dashboard</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('history')}
        className={`nav-btn ${isActive('history') ? 'nav-btn-active' : ''}`}
      >
        <span className="btn-icon">📜</span>
        <span>History</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('profile')}
        className={`nav-btn ${isActive('profile') ? 'nav-btn-active' : ''}`}
      >
        <span className="btn-icon">👤</span>
        <span>Profile</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('settings')}
        className={`nav-btn ${isActive('settings') ? 'nav-btn-active' : ''}`}
      >
        <span className="btn-icon">⚙️</span>
        <span>Settings</span>
      </button>

      <button
        type="button"
        onClick={onLogout}
        className="nav-btn nav-btn-danger"
      >
        <span className="btn-icon">🚪</span>
        <span>Logout</span>
      </button>
    </>
  );
};
