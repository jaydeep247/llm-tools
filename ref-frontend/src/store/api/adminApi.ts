import { baseApi } from './baseApi';

export interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  role: 'user' | 'admin' | 'premium';
  createdAt: string;
  lastLogin: string | null;
  isActive: boolean;
  stats: {
    totalCrawls: number;
    totalAudits: number;
    totalAeoAnalyses: number;
  };
}

export interface AdminUserDetail {
  user: {
    id: number;
    email: string;
    name: string | null;
    role: 'user' | 'admin' | 'premium';
    createdAt: string;
    lastLogin: string | null;
    isActive: boolean;
  };
  settings: {
    userId: number;
    openaiApiKey: string | null;
    psiApiKey: string | null;
    maxCrawlsPerDay: number;
    emailNotifications: boolean;
  } | null;
  stats: {
    totalCrawls: number;
    totalAudits: number;
    totalAeoAnalyses: number;
    totalCredits: number;
  };
  recentUsage: Array<{
    id: number;
    userId: number;
    actionType: string;
    timestamp: string;
    creditsUsed: number;
  }>;
  crawlSessions: Array<{
    id: number;
    startUrl: string;
    startedAt: string;
    completedAt: string | null;
    status: string;
    totalPages: number;
    pagesCrawled: number | null;
    duration: number;
    errorMessage: string | null;
  }>;
}

export interface AdminStats {
  users: {
    total: number;
    active: number;
    admins: number;
    premium: number;
    recentSignups: number;
    activeLastWeek: number;
  };
  usage: {
    totalActions: number;
    totalCreditsUsed: number;
  };
}

export interface UsersListResponse {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UpdateRoleRequest {
  role: 'user' | 'admin' | 'premium';
}

export interface UpdateStatusRequest {
  isActive: boolean;
}

export const adminApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get all users with pagination and search
    getAdminUsers: builder.query<UsersListResponse, { 
      page?: number; 
      limit?: number; 
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }>({
      query: ({ page = 1, limit = 50, search = '', sortBy = 'createdAt', sortOrder = 'desc' }) => ({
        url: '/api/admin/users',
        params: { page, limit, search, sortBy, sortOrder },
      }),
      providesTags: ['AdminUsers'],
    }),

    // Get detailed user information
    getAdminUserDetail: builder.query<AdminUserDetail, number>({
      query: (userId) => `/api/admin/users/${userId}`,
      providesTags: (result, error, userId) => [{ type: 'AdminUsers', id: userId }],
    }),

    // Update user role
    updateUserRole: builder.mutation<{ message: string; user: AdminUser }, { userId: number; role: 'user' | 'admin' | 'premium' }>({
      query: ({ userId, role }) => ({
        url: `/api/admin/users/${userId}/role`,
        method: 'PUT',
        body: { role },
      }),
      invalidatesTags: (result, error, { userId }) => [
        'AdminUsers',
        { type: 'AdminUsers', id: userId },
      ],
    }),

    // Update user active status
    updateUserStatus: builder.mutation<{ message: string; user: AdminUser }, { userId: number; isActive: boolean }>({
      query: ({ userId, isActive }) => ({
        url: `/api/admin/users/${userId}/status`,
        method: 'PUT',
        body: { isActive },
      }),
      invalidatesTags: (result, error, { userId }) => [
        'AdminUsers',
        { type: 'AdminUsers', id: userId },
      ],
    }),

    // Get platform statistics
    getAdminStats: builder.query<AdminStats, void>({
      query: () => '/api/admin/stats',
      providesTags: ['AdminStats'],
    }),
  }),
});

export const {
  useGetAdminUsersQuery,
  useGetAdminUserDetailQuery,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
  useGetAdminStatsQuery,
} = adminApi;
