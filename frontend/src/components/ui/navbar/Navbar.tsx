import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '../../../contexts/AuthContext';
import './Navbar.css';
import { Logo } from './Logo/Logo';
import { UserInfo } from './UserInfo/UserInfo';
import { NavigationButtons } from './NavigationButtons/NavigationButtons';

interface NavbarProps {
    user: User | null;
    isAuthenticated: boolean;
    onNavigate: (view: string) => void;
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
    const navigate = useNavigate();
    const location = useLocation();
    const activeView = currentView || location.pathname;

    const handleNavigate = (view: string) => {
        navigate(`/${view}`);
        onNavigate(view);
    };

    return (
        <nav className="navbar">
            <div className="navbar-container">
                <Logo onNavigate={handleNavigate} />

                <div className="navbar-actions">
                    {isAuthenticated && user ? (
                        <>
                            <UserInfo user={user} onNavigate={handleNavigate} />
                            <NavigationButtons
                                currentView={activeView}
                                onNavigate={handleNavigate}
                                onLogout={onLogout}
                            />
                        </>
                    ) : (
                        <>
                            <button type="button"
                                onClick={() => handleNavigate('login')}
                                className="nav-btn nav-btn-secondary"
                            >
                                Sign In
                            </button>
                            <button type="button"
                                onClick={() => handleNavigate('register')}
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

