import React from 'react';
import { User } from '../../../contexts/AuthContext';
import './Navbar.css';
import { Logo } from './Logo/Logo';
import { UserInfo } from './UserInfo/UserInfo';
import { NavigationButtons } from './NavigationButtons/NavigationButtons';

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
    return (
        <nav className="navbar">
            <div className="navbar-container">
                <Logo onNavigate={onNavigate} />

                <div className="navbar-actions">
                    {isAuthenticated && user ? (
                        <>
                            <UserInfo user={user} onNavigate={onNavigate} />
                            <NavigationButtons
                                currentView={currentView}
                                onNavigate={onNavigate}
                                onLogout={onLogout}
                            />
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

