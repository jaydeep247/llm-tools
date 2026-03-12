import { baseApi } from '../baseApi';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Roles that regular platform users can have.  ADMIN is not a user role. */
export type AdminUserRole =
  | 'CXO'
  | 'CMO'
  | 'SEO_MANAGER'
  | 'CONTENT_MANAGER'
  | 'ANALYST';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminUserRole;
  createdAt: string;
  updatedAt: string;
  hasNew?: boolean;
  onboardingData?: {
    role?: string;
    organizationType?: string;
    focusArea?: string;
  };
}

export interface AdminUserListParams {
  role?: AdminUserRole;
  search?: string;
}

// ─── API slice (read-only) ────────────────────────────────────────────────────

export const adminUsersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** GET /admin/users */
    adminListUsers: builder.query<AdminUser[], AdminUserListParams | void>({
      query: (params) => {
        const search = new URLSearchParams();
        if (params?.role) search.set('role', params.role);
        if (params?.search) search.set('search', params.search);
        const qs = search.toString();
        return `/admin/users${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (res: { data: AdminUser[] }) => res.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'AdminUser' as const, id })),
              { type: 'AdminUser', id: 'LIST' },
            ]
          : [{ type: 'AdminUser', id: 'LIST' }],
    }),

    /** GET /admin/users/:id */
    adminGetUser: builder.query<AdminUser, string>({
      query: (id) => `/admin/users/${id}`,
      transformResponse: (res: { data: AdminUser }) => res.data,
      providesTags: (_result, _err, id) => [{ type: 'AdminUser', id }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useAdminListUsersQuery,
  useAdminGetUserQuery,
} = adminUsersApi;
