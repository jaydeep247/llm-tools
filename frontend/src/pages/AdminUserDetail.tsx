import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGetAdminUserDetailQuery } from '../store/api/adminApi';

export const AdminUserDetail: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetAdminUserDetailQuery(Number(userId));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading user details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-8 max-w-md">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Error</h2>
          <p className="text-gray-300 mb-4">Failed to load user details</p>
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
          >
            Back to Admin Panel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin')}
            className="text-blue-400 hover:text-blue-300 mb-4 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Admin Panel
          </button>
          <h1 className="text-3xl font-bold text-white">User Details</h1>
        </div>

        {/* User Profile Card */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Profile Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-sm">User ID</label>
              <p className="text-white font-medium">{data.user.id}</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm">Email</label>
              <p className="text-white font-medium">{data.user.email}</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm">Name</label>
              <p className="text-white font-medium">{data.user.name || 'Not set'}</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm">Role</label>
              <p className="text-white font-medium">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  data.user.role === 'admin' ? 'bg-red-900/30 text-red-400 border border-red-500' :
                  data.user.role === 'premium' ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-500' :
                  'bg-gray-700 text-gray-300 border border-gray-600'
                }`}>
                  {data.user.role.toUpperCase()}
                </span>
              </p>
            </div>
            <div>
              <label className="text-gray-400 text-sm">Status</label>
              <p className="text-white font-medium">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  data.user.isActive
                    ? 'bg-green-900/30 text-green-400 border border-green-500'
                    : 'bg-red-900/30 text-red-400 border border-red-500'
                }`}>
                  {data.user.isActive ? 'Active' : 'Inactive'}
                </span>
              </p>
            </div>
            <div>
              <label className="text-gray-400 text-sm">Joined</label>
              <p className="text-white font-medium">
                {new Date(data.user.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <div>
              <label className="text-gray-400 text-sm">Last Login</label>
              <p className="text-white font-medium">
                {data.user.lastLogin
                  ? new Date(data.user.lastLogin).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'Never'}
              </p>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        {data.settings && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm">Max Crawls Per Day</label>
                <p className="text-white font-medium">{data.settings.maxCrawlsPerDay}</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">Email Notifications</label>
                <p className="text-white font-medium">
                  {data.settings.emailNotifications ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">OpenAI API Key</label>
                <p className="text-white font-medium">
                  {data.settings.openaiApiKey ? '✓ Configured' : '✗ Not set'}
                </p>
              </div>
              <div>
                <label className="text-gray-400 text-sm">PSI API Key</label>
                <p className="text-white font-medium">
                  {data.settings.psiApiKey ? '✓ Configured' : '✗ Not set'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Usage Statistics */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Usage Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-900 rounded-lg">
              <div className="text-3xl font-bold text-blue-400">{data.stats.totalCrawls}</div>
              <div className="text-gray-400 text-sm mt-1">Total Crawls</div>
            </div>
            <div className="text-center p-4 bg-gray-900 rounded-lg">
              <div className="text-3xl font-bold text-purple-400">{data.stats.totalAudits}</div>
              <div className="text-gray-400 text-sm mt-1">Total Audits</div>
            </div>
            <div className="text-center p-4 bg-gray-900 rounded-lg">
              <div className="text-3xl font-bold text-green-400">{data.stats.totalAeoAnalyses}</div>
              <div className="text-gray-400 text-sm mt-1">Total AEO Analyses</div>
            </div>
            <div className="text-center p-4 bg-gray-900 rounded-lg">
              <div className="text-3xl font-bold text-yellow-400">{data.stats.totalCredits}</div>
              <div className="text-gray-400 text-sm mt-1">Total Credits Used</div>
            </div>
          </div>
        </div>

        {/* Recent Usage History */}
        {data.recentUsage && data.recentUsage.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Action Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Credits Used
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {data.recentUsage.map((usage) => (
                    <tr key={usage.id} className="hover:bg-gray-750">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {new Date(usage.timestamp).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {usage.actionType}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {usage.creditsUsed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Crawled Sessions */}
        {data.crawlSessions && data.crawlSessions.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Crawled Sessions</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      URL
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Started
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Completed
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Pages
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {data.crawlSessions.map((session) => (
                    <tr key={session.id} className="hover:bg-gray-750">
                      <td className="px-6 py-4 text-sm text-gray-300 max-w-xs truncate" title={session.startUrl}>
                        <a href={session.startUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">
                          {session.startUrl}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {new Date(session.startedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {session.completedAt 
                          ? new Date(session.completedAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          session.status === 'completed' ? 'bg-green-900/30 text-green-400 border border-green-500' :
                          session.status === 'failed' ? 'bg-red-900/30 text-red-400 border border-red-500' :
                          session.status === 'running' ? 'bg-blue-900/30 text-blue-400 border border-blue-500' :
                          'bg-gray-700 text-gray-300'
                        }`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {session.pagesCrawled ?? 0} / {session.totalPages ?? 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {session.duration}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
