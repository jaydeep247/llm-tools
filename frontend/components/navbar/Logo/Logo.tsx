import React from 'react';
import './Logo.css';

interface LogoProps {
  onNavigate: (view: 'home' | 'profile' | 'settings' | 'history' | 'login' | 'register') => void;
}

export const Logo: React.FC<LogoProps> = ({ onNavigate }) => {
  return (
    <button
      type="button"
      onClick={() => onNavigate('home')}
      className="navbar-logo"
    >
      <span className="logo-icon">📊</span>
      <span className="logo-text">Contentlytics</span>
    </button>
  );
};
