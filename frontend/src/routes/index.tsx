import React from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { AdminRoute } from '../components/auth/AdminRoute';

// Pages
import { HomePage } from '../app/home/HomePage';
import { Login } from '../components/auth/Login';
import { Register } from '../components/auth/Register';
import { AdminLogin } from '../components/auth/AdminLogin';
import { UserProfile } from '../components/ui/user/UserProfile';
import { UserSettings } from '../components/ui/user/UserSettings';
import { CrawlHistory } from '../pages/CrawlHistory';
import LinkExplorer from '../pages/LinkExplorer';
import DataViewer from '../pages/DataViewer';
import AuditsPage from '../pages/AuditsPage';
import DashboardPage from '../pages/DashboardPage';
import HistoryDetailPage from '../pages/HistoryDetailPage';
import { Navbar } from '../components/ui/navbar/Navbar';
import { AdminNavbar } from '../components/ui/navbar/AdminNavbar';
import { Footer } from '../components/ui/footer/Footer';
import { AdminPanel } from '../pages/AdminPanel';
import { AdminUserDetail } from '../pages/AdminUserDetail';
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

const AdminLoginWrapper: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <AdminLogin
      onSuccess={() => {
        // Redirect to /admin - AdminRoute will handle access control
        navigate('/admin');
      }}
    />
  );
};

const LinkExplorerWrapper: React.FC = () => {
  const navigate = useNavigate();
  
  return <LinkExplorer onClose={() => navigate('/dashboard')} />;
};

const DataViewerWrapper: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  
  return <DataViewer 
    onClose={() => navigate('/dashboard')} 
    initialSessionId={sessionId ? parseInt(sessionId, 10) : null}
  />;
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
      
      {/* Admin Routes */}
      <Route
        path="/admin/login"
        element={<AdminLoginWrapper />}
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout>
              <AdminPanel />
            </AdminLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users/:userId"
        element={
          <AdminRoute>
            <AdminLayout>
              <AdminUserDetail />
            </AdminLayout>
          </AdminRoute>
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
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar
        user={null}
        isAuthenticated={false}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
      <main className="flex-1">{children}</main>
      <Footer />
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
    <div className="min-h-screen bg-black flex flex-col" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
      <Navbar
        user={user}
        isAuthenticated={isAuthenticated}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        currentView={window.location.pathname}
      />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
};

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <AdminNavbar
        user={user}
        onLogout={handleLogout}
      />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
};

