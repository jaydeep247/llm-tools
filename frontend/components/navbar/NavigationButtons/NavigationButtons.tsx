import React from 'react';
import './NavigationButtons.css';

interface NavigationButtonsProps {
  currentView?: string;
  onNavigate: (view: 'home' | 'profile' | 'settings' | 'history' | 'login' | 'register') => void;
  onLogout: () => void;
}

export const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  currentView,
  onNavigate,
  onLogout
}) => {
  return (
    <>
      <button
        type="button"
        onClick={() => onNavigate('history')}
        className={`nav-btn ${currentView === 'history' ? 'nav-btn-active' : ''}`}
      >
        <span className="btn-icon">📜</span>
        <span>History</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('profile')}
        className={`nav-btn ${currentView === 'profile' ? 'nav-btn-active' : ''}`}
      >
        <span className="btn-icon">👤</span>
        <span>Profile</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('settings')}
        className={`nav-btn ${currentView === 'settings' ? 'nav-btn-active' : ''}`}
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
