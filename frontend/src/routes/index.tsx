import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

// Pages
import { HomePage } from '../app/home/HomePage';
import { Login } from '../components/auth/Login';
import { Register } from '../components/auth/Register';
import { UserProfile } from '../components/ui/user/UserProfile';
import { UserSettings } from '../components/ui/user/UserSettings';
import { CrawlHistory } from '../pages/CrawlHistory';
import LinkExplorer from '../pages/LinkExplorer';
import DataViewer from '../pages/DataViewer';
import AuditsPage from '../pages/AuditsPage';
import DashboardPage from '../pages/DashboardPage';
import HistoryDetailPage from '../pages/HistoryDetailPage';
import { Navbar } from '../components/ui/navbar/Navbar';

// Wrapper components for pages that need navigation props
const HomePageWrapper: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <HomePage 
      onLogin={() => navigate('/login')}
      onRegister={() => navigate('/register')}
    />
  );
};

const LoginWrapper: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <Login
      onSwitchToRegister={() => navigate('/register')}
      onSuccess={() => navigate('/dashboard')}
    />
  );
};

const RegisterWrapper: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <Register
      onSwitchToLogin={() => navigate('/login')}
      onSuccess={() => navigate('/dashboard')}
    />
  );
};

const LinkExplorerWrapper: React.FC = () => {
  const navigate = useNavigate();
  
  return <LinkExplorer onClose={() => navigate('/dashboard')} />;
};

const DataViewerWrapper: React.FC = () => {
  const navigate = useNavigate();
  
  return <DataViewer onClose={() => navigate('/dashboard')} />;
};

const CrawlHistoryWrapper: React.FC = () => {
  const navigate = useNavigate();
  
  const handleSelectCrawl = (url: string, sessionId: number, aeoResult: any) => {
    navigate(`/history/${sessionId}`);
  };

  return <CrawlHistory onSelectCrawl={handleSelectCrawl} />;
};

export const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      <Route 
        path="/" 
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <PublicLayout>
              <HomePageWrapper />
            </PublicLayout>
          )
        } 
      />
      <Route 
        path="/login" 
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <PublicLayout>
              <LoginWrapper />
            </PublicLayout>
          )
        } 
      />
      <Route 
        path="/register" 
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <PublicLayout>
              <RegisterWrapper />
            </PublicLayout>
          )
        } 
      />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history/:id"
        element={
          <ProtectedRoute>
            <HistoryDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <CrawlHistoryWrapper />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <UserProfile />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <UserSettings />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/links"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <LinkExplorerWrapper />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/data"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <DataViewerWrapper />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audits"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AuditsPage />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// Layout Components
const PublicLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleNavigate = (view: string) => {
    navigate(`/${view}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-black">
      <Navbar
        user={null}
        isAuthenticated={false}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
      {children}
    </div>
  );
};

const ProtectedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  const handleNavigate = async (view: string) => {
    if (view === 'profile') {
      try { await refreshUser(); } catch { }
    }
    navigate(`/${view}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-black" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
      <Navbar
        user={user}
        isAuthenticated={isAuthenticated}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        currentView={window.location.pathname}
      />
      <div className="container mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  );
};

