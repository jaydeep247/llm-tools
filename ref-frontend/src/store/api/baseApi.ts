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

/**
 * Promise-based mutex for the single in-flight token refresh.
 *
 * Why not a boolean flag:
 *   A boolean only prevents a second refresh from starting, but concurrent 401
 *   requests that arrive while isRefreshing=true return their 401 error immediately
 *   and are never retried. Those errors percolate up, cause component remounts,
 *   and produce another wave of 401s — the classic infinite-refresh loop.
 *
 * How this works:
 *   All concurrent 401 requests share one refresh Promise. They all await it
 *   and all retry with the new cookie once it resolves. If refresh fails we
 *   redirect to /signin — we do NOT call resetApiState() because that would
 *   clear all RTK Query cache, immediately re-fire every subscribed query,
 *   and restart the loop.
 */
let refreshingTokenPromise: Promise<boolean> | null = null;

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    const url = typeof args === 'string' ? args : args.url;

    // Never attempt to refresh when the failing request IS the refresh itself.
    if (url === '/auth/refresh') return result;

    if (!refreshingTokenPromise) {
      // First 401 to arrive — start a single refresh and share the promise.
      refreshingTokenPromise = (async () => {
        try {
          const refreshResult = await rawBaseQuery(
            { url: '/auth/refresh', method: 'POST' },
            api,
            extraOptions,
          );
          if (refreshResult.error) {
            // Refresh failed (session truly expired) — navigate to sign-in,
            // but ONLY when the user is on a protected route. Public pages
            // (/, /signin, marketing pages) also call useGetMeQuery to check
            // auth state; blindly redirecting them breaks unauthenticated
            // navigation. The Next.js middleware already enforces protection
            // for /dashboard, /admin, /onboarding, and /brand-onboarding.
            // IMPORTANT: do NOT call resetApiState() here. Clearing all
            // RTK Query cache causes every active subscriber to immediately
            // re-fire, each of which gets 401 → triggers another refresh →
            // infinite loop. A hard redirect stops the cycle cleanly.
            if (typeof window !== 'undefined') {
              const { pathname } = window.location;
              const protectedPrefixes = ['/dashboard', '/admin', '/onboarding', '/brand-onboarding'];
              const isProtected = protectedPrefixes.some(
                p => pathname === p || pathname.startsWith(p + '/'),
              );
              if (isProtected) {
                window.location.replace('/signin');
              }
            }
            return false;
          }
          return true;
        } catch {
          if (typeof window !== 'undefined') {
            const { pathname } = window.location;
            const protectedPrefixes = ['/dashboard', '/admin', '/onboarding', '/brand-onboarding'];
            const isProtected = protectedPrefixes.some(
              p => pathname === p || pathname.startsWith(p + '/'),
            );
            if (isProtected) {
              window.location.replace('/signin');
            }
          }
          return false;
        } finally {
          // Clear the shared promise so the next independent 401 starts fresh.
          refreshingTokenPromise = null;
        }
      })();
    }

    // All 401 requests (including the initiator) wait here, then retry.
    const wasRefreshed = await refreshingTokenPromise;
    if (wasRefreshed) {
      result = await rawBaseQuery(args, api, extraOptions);
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
    'GeoContent',
  ],
  endpoints: () => ({}),
});
