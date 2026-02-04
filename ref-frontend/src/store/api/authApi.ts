import { baseApi } from './baseApi';

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: 'user' | 'admin' | 'premium';
  createdAt: string;
  lastLogin: string | null;
}

export interface UserSettings {
  maxCrawlsPerDay: number;
  emailNotifications: boolean;
  hasOpenaiApiKey: boolean;
  hasPsiApiKey: boolean;
}

export interface UsageStats {
  totalCrawls: number;
  totalAudits: number;
  totalAeoAnalyses: number;
  totalCredits: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginResponse {
  accessToken: string;
}

export interface MeResponse {
  user: User;
  settings: UserSettings;
  usage: UsageStats;
}

export interface UpdateProfileRequest {
  name?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateSettingsRequest {
  maxCrawlsPerDay?: number;
  emailNotifications?: boolean;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/api/auth/login',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['Auth', 'User'],
    }),
    register: builder.mutation<LoginResponse, RegisterRequest>({
      query: (data) => ({
        url: '/api/auth/register',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Auth', 'User'],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({
        url: '/api/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['Auth', 'User'],
    }),
    refreshToken: builder.mutation<LoginResponse, void>({
      query: () => ({
        url: '/api/auth/refresh',
        method: 'POST',
      }),
    }),
    getMe: builder.query<MeResponse, void>({
      query: () => '/api/auth/me',
      providesTags: ['User'],
    }),
    updateProfile: builder.mutation<void, UpdateProfileRequest>({
      query: (updates) => ({
        url: '/api/auth/profile',
        method: 'PUT',
        body: updates,
      }),
      invalidatesTags: ['User'],
    }),
    updateSettings: builder.mutation<void, UpdateSettingsRequest>({
      query: (updates) => ({
        url: '/api/auth/settings',
        method: 'PUT',
        body: updates,
      }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useRefreshTokenMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useUpdateProfileMutation,
  useUpdateSettingsMutation,
} = authApi;
