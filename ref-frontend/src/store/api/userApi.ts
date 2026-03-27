import { baseApi } from './baseApi';
import { User } from '@/types/auth';
import { authApi } from './authApi';

export const userApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    updateUser: builder.mutation<User, { id: string; data: Partial<User> }>({
      query: ({ id, data }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (response: { data: User }) => response.data,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            authApi.util.upsertQueryData('getMe', undefined, { user: data })
          );
        } catch {}
      },
      invalidatesTags: ['User'],
    }),
  }),
});

export const { useUpdateUserMutation } = userApi;
