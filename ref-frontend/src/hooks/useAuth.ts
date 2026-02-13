'use client';

import { useGetMeQuery } from '@/store/api/authApi';

export const useAuth = () => {
  const { data, isLoading, error, refetch } = useGetMeQuery(undefined);

  const refreshAuth = async () => {
    try {
      await refetch();
    } catch (error) {
      // Silent error
    }
  };

  return {
    user: data?.user,
    isAuthenticated: !!data?.user,
    isLoading,
    error,
    refreshAuth,
  };
};
