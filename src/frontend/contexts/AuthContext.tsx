import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
    id: number;
    email: string;
    name: string | null;
    role: 'user' | 'admin' | 'premium';
    createdAt: string;
    lastLogin: string | null;
}

export interface UserSettings {
    maxCrawlsPerDay: number;
    emailNotifications: boolean;
    hasOpenaiApiKey: boolean;
    hasPsiApiKey: boolean;
}

export interface UsageStats {
    totalCrawls: number;
    totalAudits: number;
    totalAeoAnalyses: number;
    totalCredits: number;
}

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

// Use relative URLs when in development to avoid CORS issues
// In development, empty string means requests go through Vite proxy
// In production, set VITE_API_BASE_URL to your production domain
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [usage, setUsage] = useState<UsageStats | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(
        localStorage.getItem('accessToken')
    );
    const [isLoading, setIsLoading] = useState(true);

    // Load user on mount
    useEffect(() => {
        const initAuth = async () => {
            if (accessToken) {
                console.log('[AuthContext] Token found in storage, loading user...');
                await loadUser();
            } else {
                console.log('[AuthContext] No token in storage, attempting to refresh via cookie...');
                const refreshed = await refreshAccessToken();
                if (refreshed) {
                    console.log('[AuthContext] Session restored via refresh token.');
                    await loadUser();
                } else {
                    console.log('[AuthContext] No session found.');
                    setIsLoading(false);
                }
            }
        };

        initAuth();
    }, []);

    // Set up token refresh interval (every 10 minutes)
    useEffect(() => {
        if (accessToken) {
            const interval = setInterval(() => {
                refreshAccessToken();
            }, 10 * 60 * 1000); // 10 minutes

            return () => clearInterval(interval);
        }
    }, [accessToken]);

    const loadUser = async () => {
        console.log('[AuthContext] loadUser called. Has accessToken:', !!accessToken);
        if (!accessToken) {
            console.log('[AuthContext] No access token, skipping loadUser');
            setIsLoading(false);
            return;
        }

        try {
            // Use relative URL to go through Vite proxy in development, or absolute URL in production
            const meUrl = API_BASE ? `${API_BASE}/api/auth/me` : '/api/auth/me';
            console.log(`[AuthContext] Fetching user profile from: ${meUrl}`);
            const response = await fetch(meUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                credentials: 'include'
            });

            console.log('[AuthContext] Profile fetch response status:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('[AuthContext] User loaded successfully:', data.user.email);
                setUser(data.user);
                setSettings(data.settings);
                setUsage(data.usage);
            } else {
                // Token invalid, clear and don't retry
                const errorText = await response.text();
                console.warn('[AuthContext] Failed to load user, token may be invalid. Status:', response.status, 'Response:', errorText);
                setAccessToken(null);
                setUser(null);
                localStorage.removeItem('accessToken');
            }
        } catch (error) {
            console.error('[AuthContext] Failed to load user (Network/CORS error):', error);
            // setAccessToken(null);
            // setUser(null);
            // localStorage.removeItem('accessToken');
            // TEMPORARY: Don't wipe token on network error to debug
            console.warn('[AuthContext] Keeping token despite network error for debugging');
        } finally {
            setIsLoading(false);
        }
    };

    const refreshAccessToken = async () => {
        try {
            // Use relative URL to go through Vite proxy in development, or absolute URL in production
            const refreshUrl = API_BASE ? `${API_BASE}/api/auth/refresh` : '/api/auth/refresh';
            const response = await fetch(refreshUrl, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setAccessToken(data.accessToken);
                localStorage.setItem('accessToken', data.accessToken);
                // Don't call loadUser here to avoid infinite loop
                return true;
            } else {
                // Refresh failed, clear state
                setAccessToken(null);
                setUser(null);
                localStorage.removeItem('accessToken');
                return false;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            setAccessToken(null);
            setUser(null);
            localStorage.removeItem('accessToken');
            return false;
        }
    };

    const login = async (email: string, password: string) => {
        const loginUrl = API_BASE ? `${API_BASE}/api/auth/login` : '/api/auth/login';
        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Login failed');
        }

        const data = await response.json();
        setAccessToken(data.accessToken);
        localStorage.setItem('accessToken', data.accessToken);

        // Load full profile with the new token
        const meUrl = API_BASE ? `${API_BASE}/api/auth/me` : '/api/auth/me';
        const meResponse = await fetch(meUrl, {
            headers: {
                'Authorization': `Bearer ${data.accessToken}`
            },
            credentials: 'include'
        });

        if (meResponse.ok) {
            const meData = await meResponse.json();
            setUser(meData.user);
            setSettings(meData.settings);
            setUsage(meData.usage);
        }
    };

    const register = async (email: string, password: string, name?: string) => {
        const registerUrl = API_BASE ? `${API_BASE}/api/auth/register` : '/api/auth/register';
        const response = await fetch(registerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name }),
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Registration failed');
        }

        const data = await response.json();
        setAccessToken(data.accessToken);
        localStorage.setItem('accessToken', data.accessToken);

        // Load full profile with the new token
        const meUrl = API_BASE ? `${API_BASE}/api/auth/me` : '/api/auth/me';
        const meResponse = await fetch(meUrl, {
            headers: {
                'Authorization': `Bearer ${data.accessToken}`
            },
            credentials: 'include'
        });

        if (meResponse.ok) {
            const meData = await meResponse.json();
            setUser(meData.user);
            setSettings(meData.settings);
            setUsage(meData.usage);
        }
    };

    const logout = async () => {
        try {
            const logoutUrl = API_BASE ? `${API_BASE}/api/auth/logout` : '/api/auth/logout';
            await fetch(logoutUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setAccessToken(null);
            setUser(null);
            setSettings(null);
            setUsage(null);
            localStorage.removeItem('accessToken');
        }
    };

    const refreshUser = async () => {
        if (accessToken) {
            await loadUser();
        }
    };

    const updateProfile = async (updates: { name?: string; currentPassword?: string; newPassword?: string }) => {
        const profileUrl = API_BASE ? `${API_BASE}/api/auth/profile` : '/api/auth/profile';
        const response = await fetch(profileUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates),
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Update failed');
        }

        await refreshUser();
    };

    const updateSettings = async (updates: Partial<Pick<UserSettings, 'maxCrawlsPerDay' | 'emailNotifications'>>) => {
        const settingsUrl = API_BASE ? `${API_BASE}/api/auth/settings` : '/api/auth/settings';
        const response = await fetch(settingsUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates),
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Settings update failed');
        }

        await refreshUser();
    };

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
                    response = await fetch(input, newConfig);
                    // If still 401 after refresh, the refresh token is also invalid
                    if (response.status === 401) {
                        // Await logout to ensure state is cleared before returning
                        await logout();
                    }
                    return response;
                }
            }
            // If refresh failed or no new token, logout (but don't await to avoid blocking)
            // The response will still be 401, and components should handle it
            logout().catch(console.error);
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

