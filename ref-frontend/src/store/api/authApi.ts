import { baseApi } from './baseApi';
import { User, SignupRequest, LoginRequest, AuthResponse } from '@/types/auth';

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    signup: builder.mutation<AuthResponse, SignupRequest>({
      query: (data) => ({
        url: '/auth/signup',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response: { data: AuthResponse }) => response.data,
      invalidatesTags: ['Auth', 'User'],
    }),
    
    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      transformResponse: (response: { data: AuthResponse }) => response.data,
      invalidatesTags: ['Auth', 'User'],
    }),
    
    logout: builder.mutation<void, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      // After logout succeeds (or fails), wipe the entire RTK Query cache so
      // `getMe` data is immediately cleared and every component reflects the
      // logged-out state without waiting for a refetch.
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
        } catch {
          // ignore server errors — we still want to clear local state
        } finally {
          dispatch(baseApi.util.resetApiState())
        }
      },
    }),
    
    getMe: builder.query<{ user: User }, void>({
      query: () => '/auth/me',
      transformResponse: (response: { data: User }) => ({ user: response.data }),
      providesTags: ['User'],
    }),
  }),
});

export const {
  useSignupMutation,
  useLoginMutation,
  useLogoutMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
} = authApi;
