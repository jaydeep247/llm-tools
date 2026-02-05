import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers) => {
    // Headers are set automatically, auth is handled via httpOnly cookies
    headers.set('Content-Type', 'application/json');
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);
  
  if (result.error && result.error.status === 401) {
    // Try to refresh the token
    const refreshResult = await baseQuery(
      { url: '/api/auth/refresh', method: 'POST' },
      api,
      extraOptions
    );
    
    if (refreshResult.data) {
      // Token refreshed via httpOnly cookie, retry the original query
      result = await baseQuery(args, api, extraOptions);
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
    'Data',
    'Session',
    'Links',
    'Audit',
    'AEO',
    'SEO',
    'Schedule',
    'Cron',
    'Sentiment',
    'AdminUsers',
    'AdminStats',
    'Project',
    'ContentMetrics',
    'AnswerCompleteness',
  ],
  endpoints: () => ({}),
});
