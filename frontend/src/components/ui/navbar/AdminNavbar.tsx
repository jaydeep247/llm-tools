import React from 'react';
import { useNavigate } from 'react-router-dom';

interface AdminNavbarProps {
  user: {
    email: string;
    name: string | null;
  } | null;
  onLogout: () => void;
}

export const AdminNavbar: React.FC<AdminNavbarProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();

  return (
    <nav className="bg-gray-900 border-b border-red-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <div 
            className="flex items-center cursor-pointer"
            onClick={() => navigate('/admin')}
          >
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <div className="text-white font-bold text-lg">Admin Panel</div>
                <div className="text-red-400 text-xs">Contentlytics</div>
              </div>
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            {user && (
              <>
                <div className="text-right">
                  <div className="text-white text-sm font-medium">
                    {user.name || user.email}
                  </div>
                  <div className="text-gray-400 text-xs">Administrator</div>
                </div>

                <button
                  onClick={onLogout}
                  className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded transition-colors"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
