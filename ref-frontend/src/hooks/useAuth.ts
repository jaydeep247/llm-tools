'use client';

import { useGetMeQuery } from '@/store/api/authApi';

export const useAuth = () => {
  const { data, isLoading, error, refetch } = useGetMeQuery(undefined);

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
