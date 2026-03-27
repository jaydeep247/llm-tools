'use client';

import { useEffect } from 'react';
import { useGetMeQuery, useRefreshMutation } from '@/store/api/authApi';

export const useAuth = () => {
  const { data, isLoading, error, refetch } = useGetMeQuery(undefined, {
    // Poll every 5 minutes to keep profile data fresh
    pollingInterval: 5 * 60 * 1000,
    refetchOnMountOrArgChange: true,
    refetchOnReconnect: true,
    refetchOnFocus: true,
  });

  const [refreshToken] = useRefreshMutation();

  useEffect(() => {
    if (data?.user) {
      // Set up automatic silent refresh every 14 minutes
      // (assuming 15m or longer token expiry)
      const interval = setInterval(() => {
        refreshToken().catch(() => {});
      }, 14 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [data?.user, refreshToken]);

  const refreshAuth = async () => {
    try {
      await refetch();
    } catch {
      // Silent error
    }
  };

  // If there's an error (e.g. 401 after logout / expired session) treat as
  // unauthenticated. RTK Query keeps stale `data` even when a refetch fails,
  // so we must not rely on `data` alone.
  const user = error ? undefined : data?.user;

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    refreshAuth,
  };
};
