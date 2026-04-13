import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers) => {
    headers.set('Content-Type', 'application/json');
    return headers;
  },
  credentials: 'include',
});

// Mutex flag — prevents parallel 401s from firing multiple refresh calls.
let isRefreshing = false;

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    const url = typeof args === 'string' ? args : args.url;

    // Never attempt to refresh if the failing request is the refresh itself.
    if (url === '/auth/refresh') return result;

    if (!isRefreshing) {
      isRefreshing = true;
      const refreshResult = await rawBaseQuery(
        { url: '/auth/refresh', method: 'POST' },
        api,
        extraOptions
      );
      isRefreshing = false;

      if (refreshResult.error) {
        // Refresh failed — wipe cached state so UI reflects logged-out.
        api.dispatch(baseApi.util.resetApiState());
      } else {
        // Token renewed — retry the original request.
        result = await rawBaseQuery(args, api, extraOptions);
      }
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'Auth',
    'User',
    'AdminUser',
    'Project',
    'Session',
    'Job',
    'ModuleA',
    'ModuleE',
    'ModuleC',
    'ModuleF',
    'QuickStart',
    'GA4',
    'Alerts',
    'AuditReport',
    'Export',
    'WeeklyReport',
  ],
  endpoints: () => ({}),
});
