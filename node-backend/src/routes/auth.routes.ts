import express, { Request, Response } from 'express';
import { getAuthService } from '../services/AuthService.js';
import { getDatabase } from '../services/DatabaseService.js';
import { authenticateUser } from '../middleware/authMiddleware.js';
import { Logger } from '../helpers/logging/Logger.js';

const router = express.Router();
const authService = getAuthService();
const db = getDatabase();
const logger = Logger.getInstance();

/**
 * Get cookie options for setting cookies
 * - For HTTPS: use 'none' for sameSite (allows cross-origin)
 * - For HTTP: use 'lax' for sameSite (same-origin only, but works with IP addresses)
 */
const getCookieOptions = () => {
    // Check if we should use secure cookies (HTTPS only)
    // COOKIE_SECURE=true explicitly enables secure cookies (requires HTTPS)
    const useSecure = process.env.COOKIE_SECURE === 'true';
    
    // sameSite: 'none' REQUIRES secure: true (HTTPS only)
    // For HTTP (like IP addresses), we must use 'lax' or 'strict'
    // 'lax' allows cookies to be sent on same-site requests and top-level navigations
    const sameSiteValue = useSecure ? ('none' as const) : ('lax' as const);
    
    const options: any = {
        httpOnly: true,
        secure: useSecure, // false for HTTP, true for HTTPS
        sameSite: sameSiteValue,
        maxAge: undefined as number | undefined, // Will be set per cookie
        path: '/', // Ensure cookies are available for all paths
    };
    
    // Only set domain if explicitly configured AND not using IP address
    // IP addresses cannot use domain cookies
    if (process.env.COOKIE_DOMAIN && !process.env.CORS_ORIGIN?.match(/^\d+\.\d+\.\d+\.\d+/)) {
        options.domain = process.env.COOKIE_DOMAIN;
    }
    
    logger.info('Cookie options configured', { 
        useSecure, 
        sameSite: sameSiteValue, 
        hasDomain: !!options.domain,
        corsOrigin: process.env.CORS_ORIGIN 
    });
    
    return options;
};

/**
 * Get cookie options for clearing cookies (must match setting options)
 */
const getClearCookieOptions = () => {
    // Match the same logic as getCookieOptions
    const useSecure = process.env.COOKIE_SECURE === 'true';
    const sameSiteValue = useSecure ? ('none' as const) : ('lax' as const);
    
    const options: any = {
        httpOnly: true,
        secure: useSecure,
        sameSite: sameSiteValue,
        path: '/',
    };
    
    // Only set domain if explicitly configured AND not using IP address
    if (process.env.COOKIE_DOMAIN && !process.env.CORS_ORIGIN?.match(/^\d+\.\d+\.\d+\.\d+/)) {
        options.domain = process.env.COOKIE_DOMAIN;
    }
    
    return options;
};

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Email and password are required'
            });
        }

        // Validate email format
        if (!authService.isValidEmail(email)) {
            return res.status(400).json({
                error: 'Invalid email',
                message: 'Please provide a valid email address'
            });
        }

        // Validate password strength
        const passwordValidation = authService.isValidPassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({
                error: 'Weak password',
                message: 'Password does not meet requirements',
                errors: passwordValidation.errors
            });
        }

        // Check if user already exists
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                error: 'User exists',
                message: 'A user with this email already exists'
            });
        }

        // Hash password
        const passwordHash = await authService.hashPassword(password);

        // Create user
        const userId = await db.createUser({
            email,
            passwordHash,
            name: name || null,
            isActive: true,
            role: 'user'
        });

        // Generate tokens
        const tokens = authService.generateTokens({
            id: userId,
            email,
            role: 'user'
        });

        // Set both access token and refresh token as HTTP-only cookies
        const cookieOptions = getCookieOptions();
        res.cookie('accessToken', tokens.accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000 // 15 minutes
        });

        res.cookie('refreshToken', tokens.refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        logger.info('User registered successfully', { userId, email });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: userId,
                email,
                name: name || null,
                role: 'user'
            },
            accessToken: tokens.accessToken
        });
    } catch (error) {
        logger.error('Registration error', error as Error);
        res.status(500).json({
            error: 'Registration failed',
            message: 'An error occurred during registration'
        });
    }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                error: 'Missing credentials',
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Email or password is incorrect'
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({
                error: 'Account disabled',
                message: 'Your account has been disabled. Please contact support.'
            });
        }

        // Verify password
        const isPasswordValid = await authService.verifyPassword(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Email or password is incorrect'
            });
        }

        // Update last login
        await db.updateUserLastLogin(user.id);

        // Generate tokens
        const tokens = authService.generateTokens({
            id: user.id,
            email: user.email,
            role: user.role
        });

        // Set both access token and refresh token as HTTP-only cookies
        const cookieOptions = getCookieOptions();
        res.cookie('accessToken', tokens.accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000 // 15 minutes
        });

        res.cookie('refreshToken', tokens.refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        logger.info('User logged in successfully', { userId: user.id, email: user.email });

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                lastLogin: user.lastLogin
            },
            accessToken: tokens.accessToken
        });
    } catch (error) {
        logger.error('Login error', error as Error);
        res.status(500).json({
            error: 'Login failed',
            message: 'An error occurred during login'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout user by clearing refresh token cookie
 */
router.post('/logout', authenticateUser, async (req: Request, res: Response) => {
    try {
        // Clear both access token and refresh token cookies (must use same options as setting)
        const clearOptions = getClearCookieOptions();
        res.clearCookie('accessToken', clearOptions);
        res.clearCookie('refreshToken', clearOptions);

        logger.info('User logged out', { userId: req.user?.userId });

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        logger.error('Logout error', error as Error);
        res.status(500).json({
            error: 'Logout failed',
            message: 'An error occurred during logout'
        });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
    try {
        logger.info('Refresh token request received', {
            hasCookies: !!req.cookies,
            cookieNames: req.cookies ? Object.keys(req.cookies) : [],
            origin: req.headers.origin,
            referer: req.headers.referer
        });

        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            logger.warn('Refresh token not found in cookies');
            return res.status(401).json({
                error: 'No refresh token',
                message: 'Refresh token not found'
            });
        }

        // Verify refresh token
        logger.info('Verifying refresh token');
        const payload = authService.verifyRefreshToken(refreshToken);
        const clearOptions = getClearCookieOptions();
        if (!payload) {
            logger.warn('Invalid or expired refresh token');
            res.clearCookie('accessToken', clearOptions);
            res.clearCookie('refreshToken', clearOptions);
            return res.status(401).json({
                error: 'Invalid refresh token',
                message: 'Refresh token is invalid or expired'
            });
        }

        logger.info('Refresh token verified', { userId: payload.userId });

        // Check if user still exists and is active
        logger.info('Fetching user from database', { userId: payload.userId });
        const user = await db.getUserById(payload.userId);
        if (!user || !user.isActive) {
            logger.warn('User not found or inactive', { userId: payload.userId, userExists: !!user, isActive: user?.isActive });
            res.clearCookie('accessToken', clearOptions);
            res.clearCookie('refreshToken', clearOptions);
            return res.status(401).json({
                error: 'User not found',
                message: 'User no longer exists or is disabled'
            });
        }

        logger.info('User found and active', { userId: user.id, email: user.email });

        // Generate new tokens
        logger.info('Generating new tokens');
        const tokens = authService.generateTokens({
            id: user.id,
            email: user.email,
            role: user.role
        });

        // Update both access token and refresh token cookies
        const cookieOptions = getCookieOptions();
        res.cookie('accessToken', tokens.accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000 // 15 minutes
        });

        res.cookie('refreshToken', tokens.refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        logger.info('Tokens refreshed successfully', { userId: user.id });
        res.json({
            success: true,
            accessToken: tokens.accessToken
        });
    } catch (error) {
        logger.error('Token refresh error', error as Error);
        logger.error('Token refresh error details', {
            message: (error as Error).message,
            stack: (error as Error).stack,
            name: (error as Error).name
        });
        res.status(500).json({
            error: 'Token refresh failed',
            message: 'An error occurred while refreshing token',
            details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticateUser, async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = await db.getUserById(req.user.userId);
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'User profile not found'
            });
        }

        const settings = await db.getUserSettings(user.id);
        const usageStats = await db.getUserUsageStats(user.id);

        // Transform usage stats array into structured object
        const usage = {
            totalCrawls: usageStats.find((s: any) => s.type === 'crawl')?.count || 0,
            totalAudits: usageStats.find((s: any) => s.type === 'audit')?.count || 0,
            totalAeoAnalyses: usageStats.find((s: any) => s.type === 'aeo_analysis')?.count || 0,
            totalCredits: usageStats.reduce((sum: number, s: any) => sum + (s.credits || 0), 0)
        };

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                isActive: user.isActive
            },
            settings: settings ? {
                maxCrawlsPerDay: settings.maxCrawlsPerDay,
                emailNotifications: settings.emailNotifications,
                hasOpenaiApiKey: !!settings.openaiApiKey,
                hasPsiApiKey: !!settings.psiApiKey
            } : null,
            usage
        });
    } catch (error) {
        logger.error('Get profile error', error as Error);
        res.status(500).json({
            error: 'Failed to get profile',
            message: 'An error occurred while fetching profile'
        });
    }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticateUser, async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { name, currentPassword, newPassword } = req.body;
        const userId = req.user.userId;

        // Update name if provided
        if (name !== undefined) {
            await db.updateUser(userId, { name });
        }

        // Update password if provided
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({
                    error: 'Current password required',
                    message: 'Please provide your current password to change it'
                });
            }

            // Verify current password
            const user = await db.getUserById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const isPasswordValid = await authService.verifyPassword(currentPassword, user.passwordHash);
            if (!isPasswordValid) {
                return res.status(401).json({
                    error: 'Invalid password',
                    message: 'Current password is incorrect'
                });
            }

            // Validate new password
            const passwordValidation = authService.isValidPassword(newPassword);
            if (!passwordValidation.valid) {
                return res.status(400).json({
                    error: 'Weak password',
                    message: 'New password does not meet requirements',
                    errors: passwordValidation.errors
                });
            }

            // Hash and update password
            const newPasswordHash = await authService.hashPassword(newPassword);
            await db.updateUser(userId, { passwordHash: newPasswordHash });
        }

        logger.info('User profile updated', { userId });

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        logger.error('Update profile error', error as Error);
        res.status(500).json({
            error: 'Failed to update profile',
            message: 'An error occurred while updating profile'
        });
    }
});

/**
 * GET /api/auth/usage
 * Get user usage statistics
 */
router.get('/usage', authenticateUser, async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { since } = req.query;
        const sinceDate = since ? String(since) : undefined;

        const stats = await db.getUserUsageStats(req.user.userId, sinceDate);
        const history = await db.getUserUsage(req.user.userId, undefined, 50);
        const settings = await db.getUserSettings(req.user.userId);

        const todayCrawls = await db.getTodayUsageCount(req.user.userId, 'crawl');
        const todayAudits = await db.getTodayUsageCount(req.user.userId, 'audit');

        res.json({
            success: true,
            stats,
            history,
            today: {
                crawls: todayCrawls,
                audits: todayAudits,
                limit: settings?.maxCrawlsPerDay || 100
            }
        });
    } catch (error) {
        logger.error('Get usage error', error as Error);
        res.status(500).json({
            error: 'Failed to get usage',
            message: 'An error occurred while fetching usage statistics'
        });
    }
});

/**
 * PUT /api/auth/settings
 * Update user settings
 */
router.put('/settings', authenticateUser, async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { openaiApiKey, psiApiKey, maxCrawlsPerDay, emailNotifications } = req.body;
        const userId = req.user.userId;

        const updates: any = {};
        if (openaiApiKey !== undefined) updates.openaiApiKey = openaiApiKey;
        if (psiApiKey !== undefined) updates.psiApiKey = psiApiKey;
        if (maxCrawlsPerDay !== undefined) updates.maxCrawlsPerDay = maxCrawlsPerDay;
        if (emailNotifications !== undefined) updates.emailNotifications = emailNotifications;

        await db.updateUserSettings(userId, updates);

        logger.info('User settings updated', { userId });

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    } catch (error) {
        logger.error('Update settings error', error as Error);
        res.status(500).json({
            error: 'Failed to update settings',
            message: 'An error occurred while updating settings'
        });
    }
});

export default router;
