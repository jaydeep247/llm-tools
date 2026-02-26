import { baseApi } from './baseApi';
import { User } from '@/types/auth';

export const userApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    updateUser: builder.mutation<User, { id: string; data: Partial<User> }>({
      query: ({ id, data }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (response: { data: User }) => response.data,
      invalidatesTags: ['User'],
    }),
  }),
});

export const { useUpdateUserMutation } = userApi;
