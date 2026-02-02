import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  useGetAdminUsersQuery,
  useGetAdminStatsQuery,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
  type AdminUser,
} from '../store/api/adminApi';

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data: usersData, isLoading: usersLoading, error: usersError } = useGetAdminUsersQuery({
    page,
    limit: 20,
    search,
    sortBy,
    sortOrder,
  });

  const { data: stats, isLoading: statsLoading } = useGetAdminStatsQuery();
  const [updateUserRole] = useUpdateUserRoleMutation();
  const [updateUserStatus] = useUpdateUserStatusMutation();

  const handleRoleChange = async (userId: number, newRole: 'user' | 'admin' | 'premium') => {
    if (confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
      try {
        await updateUserRole({ userId, role: newRole }).unwrap();
      } catch (error) {
        console.error('Failed to update role:', error);
        alert('Failed to update user role');
      }
    }
  };

  const handleStatusToggle = async (userId: number, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    const action = newStatus ? 'activate' : 'deactivate';
    
    if (confirm(`Are you sure you want to ${action} this user?`)) {
      try {
        await updateUserStatus({ userId, isActive: newStatus }).unwrap();
      } catch (error) {
        console.error('Failed to update status:', error);
        alert('Failed to update user status');
      }
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-gray-400">Manage users and view platform statistics</p>
        </div>

        {/* Statistics Cards */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              title="Total Users"
              value={stats.users.total}
              subtitle={`${stats.users.active} active`}
              color="blue"
            />
            <StatCard
              title="Premium Users"
              value={stats.users.premium}
              subtitle={`${stats.users.admins} admins`}
              color="purple"
            />
            <StatCard
              title="Recent Signups"
              value={stats.users.recentSignups}
              subtitle="Last 30 days"
              color="green"
            />
            <StatCard
              title="Active This Week"
              value={stats.users.activeLastWeek}
              subtitle="Last 7 days"
              color="yellow"
            />
          </div>
        )}

        {/* Usage Statistics */}
        {!statsLoading && stats && (
          <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Platform Usage</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{stats.usage.totalActions.toLocaleString()}</div>
                <div className="text-gray-400 text-sm mt-1">Total Actions</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-400">{stats.usage.totalCreditsUsed.toLocaleString()}</div>
                <div className="text-gray-400 text-sm mt-1">Total Credits Used</div>
              </div>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h2 className="text-2xl font-bold text-white">Users</h2>
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {usersLoading && (
            <div className="p-8 text-center text-gray-400">Loading users...</div>
          )}

          {usersError && (
            <div className="p-8 text-center text-red-400">Failed to load users</div>
          )}

          {usersData && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900">
                    <tr>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800"
                        onClick={() => handleSort('id')}
                      >
                        ID {sortBy === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800"
                        onClick={() => handleSort('email')}
                      >
                        Email {sortBy === 'email' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800"
                        onClick={() => handleSort('createdAt')}
                      >
                        Joined {sortBy === 'createdAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800"
                        onClick={() => handleSort('lastLogin')}
                      >
                        Last Login {sortBy === 'lastLogin' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Usage
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {usersData.users.map((u: AdminUser) => (
                      <tr key={u.id} className="hover:bg-gray-750">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {u.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {u.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {u.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as any)}
                            disabled={u.id === user?.id}
                            className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-700 text-white border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="user">User</option>
                            <option value="premium">Premium</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleStatusToggle(u.id, u.isActive)}
                            disabled={u.id === user?.id}
                            className={`px-3 py-1 rounded-full text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                              u.isActive
                                ? 'bg-green-900/30 text-green-400 border border-green-500'
                                : 'bg-red-900/30 text-red-400 border border-red-500'
                            }`}
                          >
                            {u.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                          {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs">C: {u.stats.totalCrawls}</span>
                            <span className="text-xs">A: {u.stats.totalAudits}</span>
                            <span className="text-xs">AEO: {u.stats.totalAeoAnalyses}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => window.open(`/admin/users/${u.id}`, '_blank')}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-6 py-4 bg-gray-900 border-t border-gray-700 flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, usersData.pagination.total)} of {usersData.pagination.total} users
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-white">
                    Page {page} of {usersData.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(usersData.pagination.totalPages, p + 1))}
                    disabled={page === usersData.pagination.totalPages}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  color: 'blue' | 'purple' | 'green' | 'yellow';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, color }) => {
  const colorClasses = {
    blue: 'from-blue-900/50 to-blue-800/30 border-blue-500 text-blue-400',
    purple: 'from-purple-900/50 to-purple-800/30 border-purple-500 text-purple-400',
    green: 'from-green-900/50 to-green-800/30 border-green-500 text-green-400',
    yellow: 'from-yellow-900/50 to-yellow-800/30 border-yellow-500 text-yellow-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-lg p-6 border`}>
      <h3 className="text-gray-300 text-sm font-medium mb-2">{title}</h3>
      <div className={`text-3xl font-bold mb-1`}>{value.toLocaleString()}</div>
      <p className="text-gray-400 text-xs">{subtitle}</p>
    </div>
  );
};
