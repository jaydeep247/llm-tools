import React from 'react';
import { User } from '../../contexts/AuthContext';
import './Navbar.css';

interface NavbarProps {
    user: User | null;
    isAuthenticated: boolean;
    onNavigate: (view: 'home' | 'profile' | 'settings' | 'history' | 'login' | 'register') => void;
    onLogout: () => void;
    currentView?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
    user,
    isAuthenticated,
    onNavigate,
    onLogout,
    currentView
}) => {
    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'admin': return { icon: '👑', class: 'role-admin', text: 'Admin' };
            case 'premium': return { icon: '⭐', class: 'role-premium', text: 'Premium' };
            default: return { icon: '👤', class: 'role-user', text: 'Free' };
        }
    };

    const roleBadge = user ? getRoleBadge(user.role) : null;

    return (
        <nav className="navbar">
            <div className="navbar-container">
                {/* Logo */}
                <button type="button"
                    onClick={() => onNavigate('home')}
                    className="navbar-logo"
                >
                    <span className="logo-icon">📊</span>
                    <span className="logo-text">Contentlytics</span>
                </button>

                {/* Right Side */}
                <div className="navbar-actions">
                    {isAuthenticated && user ? (
                        <>
                            {/* User Info - Clickable to go to Home */}
                            <button
                                type="button"
                                onClick={() => onNavigate('home')}
                                className="user-info"
                                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: '0' }}
                            >
                                <span className="user-role-badge">
                                    <span className={`role-dot ${roleBadge?.class}`}></span>
                                    <span className="role-text">{roleBadge?.text}</span>
                                </span>
                                <span className="user-name">
                                    {user.name || user.email}
                                </span>
                            </button>

                            {/* Navigation Buttons */}
                            <button type="button"
                                onClick={() => onNavigate('history')}
                                className={`nav-btn ${currentView === 'history' ? 'nav-btn-active' : ''}`}
                            >
                                <span className="btn-icon">📜</span>
                                <span>History</span>
                            </button>

                            <button type="button"
                                onClick={() => onNavigate('profile')}
                                className={`nav-btn ${currentView === 'profile' ? 'nav-btn-active' : ''}`}
                            >
                                <span className="btn-icon">👤</span>
                                <span>Profile</span>
                            </button>

                            <button type="button"
                                onClick={() => onNavigate('settings')}
                                className={`nav-btn ${currentView === 'settings' ? 'nav-btn-active' : ''}`}
                            >
                                <span className="btn-icon">⚙️</span>
                                <span>Settings</span>
                            </button>

                            <button type="button"
                                onClick={onLogout}
                                className="nav-btn nav-btn-danger"
                            >
                                <span className="btn-icon">🚪</span>
                                <span>Logout</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button"
                                onClick={() => onNavigate('login')}
                                className="nav-btn nav-btn-secondary"
                            >
                                Sign In
                            </button>
                            <button type="button"
                                onClick={() => onNavigate('register')}
                                className="nav-btn nav-btn-primary"
                            >
                                Get Started
                            </button>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

