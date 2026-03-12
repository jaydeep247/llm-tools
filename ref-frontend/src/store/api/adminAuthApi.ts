import { baseApi } from './baseApi';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AdminLoginRequest {
  email: string;
  password: string;
}

interface AdminLoginResponse {
  user: AdminUser;
}

export const adminAuthApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    adminLogin: builder.mutation<AdminLoginResponse, AdminLoginRequest>({
      query: (credentials) => ({
        url: '/auth/admin/login',
        method: 'POST',
        body: credentials,
      }),
      transformResponse: (response: { data: AdminLoginResponse }) => response.data,
    }),

    adminLogout: builder.mutation<void, void>({
      query: () => ({
        url: '/auth/admin/logout',
        method: 'POST',
      }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch {
          // Server errors are ignored — the redirect handles cleanup on the client.
        } finally {
          dispatch(baseApi.util.resetApiState());
        }
      },
    }),

    adminGetMe: builder.query<{ user: AdminUser }, void>({
      query: () => '/auth/admin/me',
      transformResponse: (response: { data: AdminUser }) => ({ user: response.data }),
      providesTags: ['Auth'],
    }),
  }),
  overrideExisting: false,
});

export const { useAdminLoginMutation, useAdminLogoutMutation, useAdminGetMeQuery } = adminAuthApi;
