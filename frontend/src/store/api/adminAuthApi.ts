import { baseApi } from './baseApi';

export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginResponse {
  success: boolean;
  message: string;
  user: {
    id: number;
    email: string;
    name: string | null;
    role: 'admin';
    lastLogin: string | null;
  };
  accessToken: string;
}

export const adminAuthApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    adminLogin: builder.mutation<AdminLoginResponse, AdminLoginRequest>({
      query: (credentials) => ({
        url: '/api/auth/admin/login',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['Auth', 'User'],
    }),
  }),
});

export const { useAdminLoginMutation } = adminAuthApi;
