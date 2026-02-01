import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
    useLoginMutation,
    useRegisterMutation,
    useLogoutMutation,
    useRefreshTokenMutation,
    useGetMeQuery,
    useLazyGetMeQuery,
    useUpdateProfileMutation,
    useUpdateSettingsMutation,
    type User,
    type UserSettings,
    type UsageStats,
} from '../store/api/authApi';
import { getApiErrorMessage } from '../utils';

// Re-export types for use in other components
export type { User, UserSettings, UsageStats };

interface AuthContextType {
    user: User | null;
    settings: UserSettings | null;
    usage: UsageStats | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name?: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    updateProfile: (updates: { name?: string; currentPassword?: string; newPassword?: string }) => Promise<void>;
    updateSettings: (updates: Partial<Pick<UserSettings, 'maxCrawlsPerDay' | 'emailNotifications'>>) => Promise<void>;
    authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [accessToken, setAccessToken] = useState<string | null>(
        localStorage.getItem('accessToken')
    );
    
    // RTK Query hooks
    const [loginMutation] = useLoginMutation();
    const [registerMutation] = useRegisterMutation();
    const [logoutMutation] = useLogoutMutation();
    const [refreshTokenMutation] = useRefreshTokenMutation();
    const [updateProfileMutation] = useUpdateProfileMutation();
    const [updateSettingsMutation] = useUpdateSettingsMutation();
    const [getMeLazy] = useLazyGetMeQuery();
    
    const { data: meData, isLoading: isLoadingMe, refetch: refetchMe } = useGetMeQuery(undefined, {
        skip: !accessToken,
    });
    
    const user = meData?.user || null;
    const settings = meData?.settings || null;
    const usage = meData?.usage || null;
    const isLoading = isLoadingMe && !!accessToken;

    // Set up token refresh interval (every 10 minutes)
    useEffect(() => {
        if (accessToken) {
            const interval = setInterval(() => {
                refreshAccessToken();
            }, 10 * 60 * 1000); // 10 minutes

            return () => clearInterval(interval);
        }
    }, [accessToken]);

    const refreshAccessToken = async () => {
        try {
            const result = await refreshTokenMutation().unwrap();
            setAccessToken(result.accessToken);
            localStorage.setItem('accessToken', result.accessToken);
            return true;
        } catch (error) {
            console.error('Token refresh failed:', error);
            setAccessToken(null);
            localStorage.removeItem('accessToken');
            return false;
        }
    };

    const login = async (email: string, password: string) => {
        try {
            const result = await loginMutation({ email, password }).unwrap();
            setAccessToken(result.accessToken);
            localStorage.setItem('accessToken', result.accessToken);
            // RTK Query will automatically refetch user data via useGetMeQuery
            await refetchMe();
        } catch (error: unknown) {
            throw new Error(getApiErrorMessage(error, 'Login failed'));
        }
    };

    const register = async (email: string, password: string, name?: string) => {
        try {
            const result = await registerMutation({ email, password, name }).unwrap();
            setAccessToken(result.accessToken);
            localStorage.setItem('accessToken', result.accessToken);
            // RTK Query will automatically refetch user data via useGetMeQuery
            await refetchMe();
        } catch (error: unknown) {
            throw new Error(getApiErrorMessage(error, 'Registration failed'));
        }
    };

    const logout = async () => {
        // Cancel all running crawls/audits for this user (same as Stop button) before clearing session
        const apiBase = import.meta.env.VITE_API_BASE_URL || '';
        const cancelUrl = apiBase ? `${apiBase}/api/cancel-audits` : '/api/cancel-audits';
        try {
            await fetch(cancelUrl, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({}),
            });
        } catch (err) {
            console.error('Cancel-all on logout:', err);
        }

        try {
            await logoutMutation().unwrap();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setAccessToken(null);
            localStorage.removeItem('accessToken');
        }
    };

    const refreshUser = async () => {
        if (accessToken) {
            await refetchMe();
        }
    };

    const updateProfile = async (updates: { name?: string; currentPassword?: string; newPassword?: string }) => {
        try {
            await updateProfileMutation(updates).unwrap();
            await refetchMe();
        } catch (error: unknown) {
            throw new Error(getApiErrorMessage(error, 'Update failed'));
        }
    };

    const updateSettings = async (updates: Partial<Pick<UserSettings, 'maxCrawlsPerDay' | 'emailNotifications'>>) => {
        try {
            await updateSettingsMutation(updates).unwrap();
            await refetchMe();
        } catch (error: unknown) {
            throw new Error(getApiErrorMessage(error, 'Settings update failed'));
        }
    };

    // Keep authFetch for backward compatibility, but it's deprecated - use RTK Query instead
    const authFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        // Ensure Authorization header is present
        const initHeaders = new Headers(init?.headers);
        if (accessToken && !initHeaders.has('Authorization')) {
            initHeaders.set('Authorization', `Bearer ${accessToken}`);
        }

        const config = {
            ...init,
            headers: initHeaders,
            credentials: 'include' as RequestCredentials // Always include credentials for refresh token cookie
        };

        let response = await fetch(input, config);

        if (response.status === 401) {
            // Token might be expired, try refreshing
            const refreshSuccess = await refreshAccessToken();

            if (refreshSuccess) {
                // Get the NEW access token from state or localStorage (refreshAccessToken updates it)
                const newAccessToken = localStorage.getItem('accessToken');
                if (newAccessToken) {
                    initHeaders.set('Authorization', `Bearer ${newAccessToken}`);
                    const newConfig = {
                        ...init,
                        headers: initHeaders,
                        credentials: 'include' as RequestCredentials
                    };
                    return fetch(input, newConfig);
                }
            }
            // If refresh failed or no new token, logout
            logout();
        }

        return response;
    };

    const value: AuthContextType = {
        user,
        settings,
        usage,
        accessToken,
        isAuthenticated: !!user && !!accessToken,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        updateProfile,
        updateSettings,
        authFetch
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

