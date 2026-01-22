import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Logo.css';

interface LogoProps {
  onNavigate: (view: string) => void;
}

export const Logo: React.FC<LogoProps> = ({ onNavigate }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/');
    onNavigate('');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="navbar-logo"
    >
      <span className="logo-icon">📊</span>
      <span className="logo-text">Contentlytics</span>
    </button>
  );
};
