import React from 'react';
import './Footer.css';

export const Footer: React.FC = () => {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <p className="app-footer-copy">© {new Date().getFullYear()} Contentlytics. All rights reserved.</p>
      </div>
    </footer>
  );
};
