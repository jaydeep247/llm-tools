import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers) => {
    // Get token from localStorage
    const token = localStorage.getItem('accessToken');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
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
      // Store the new token
      const data = refreshResult.data as { accessToken: string };
      localStorage.setItem('accessToken', data.accessToken);
      
      // Retry the original query with the new token
      result = await baseQuery(args, api, extraOptions);
    } else {
      // Refresh failed, clear token
      localStorage.removeItem('accessToken');
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
    'EntityCoverage',
  ],
  endpoints: () => ({}),
});
