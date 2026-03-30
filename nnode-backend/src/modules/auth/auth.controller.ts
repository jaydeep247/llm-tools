import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ResponseUtil } from '../../utils/response';
import { signupSchema, loginSchema, googleAuthSchema } from './auth.validator';
import { logger } from '../../shared/logger/logger';
import { cookieConfig, COOKIE_NAME } from '../../config/cookie';
import { env } from '../../config/env';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * User signup
   */
  signup = async (req: Request, res: Response): Promise<Response> => {
    try {
      const data = signupSchema.parse(req.body);
      const result = await this.authService.signup(data);

      // Set JWT in HTTP-only cookie
      res.cookie(COOKIE_NAME, result.token, cookieConfig);

      return ResponseUtil.created(res, 'User registered successfully', result);
    } catch (error: any) {
      logger.error(`Signup error: ${error.message}`);
      if (
        error.message === 'User with this email already exists' ||
        error.message === 'A user with this email already exists'
      ) {
        return ResponseUtil.error(res, error.message, undefined, 409);
      }
      if (error.message === 'Account already exists. Please log in using Google.') {
        return ResponseUtil.error(res, error.message, undefined, 409);
      }
      // Fallback for any other Google-account conflict surfaced from the repository
      if (
        error.message === 'This Google account is already linked to another user' ||
        error.message === 'This email is already linked to another Google account. Please log in with Google.'
      ) {
        return ResponseUtil.error(
          res,
          'An account with this email already exists. Please sign in using Google.',
          undefined,
          409
        );
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Signup failed');
    }
  };

  /**
   * User login
   */
  login = async (req: Request, res: Response): Promise<Response> => {
    try {
      const data = loginSchema.parse(req.body);
      const result = await this.authService.login(data);

      // Set JWT in HTTP-only cookie
      res.cookie(COOKIE_NAME, result.token, cookieConfig);

      return ResponseUtil.success(res, 'Login successful', result);
    } catch (error: any) {
      logger.error(`Login error: ${error.message}`);
      if (error.message === 'Invalid credentials') {
        return ResponseUtil.unauthorized(res, error.message);
      }
      if (error.message === 'Please log in using Google.') {
        return ResponseUtil.error(res, error.message, undefined, 403);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Login failed');
    }
  };

  /**
   * User logout
   */
  logout = async (_req: Request, res: Response): Promise<Response> => {
    try {
      // Clear cookie
      res.clearCookie(COOKIE_NAME);
      return ResponseUtil.success(res, 'Logout successful');
    } catch (error) {
      logger.error('Logout error:', error);
      return ResponseUtil.serverError(res, 'Logout failed');
    }
  };

  /**
   * Silent token refresh
   */
  refresh = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user || !req.user.userId) {
        return ResponseUtil.unauthorized(res, 'Invalid session');
      }

      // We rely on authMiddleware to have verified the existing token
      // Re-issue a fresh token
      const token = await this.authService.refreshToken(req.user.userId);
      res.cookie(COOKIE_NAME, token, cookieConfig);

      return ResponseUtil.success(res, 'Token refreshed successfully');
    } catch (error: any) {
      logger.error(`Refresh token error: ${error.message}`);
      return ResponseUtil.unauthorized(res, 'Session expired. Please log in again.');
    }
  };

  /**
   * Get current user
   */
  getCurrentUser = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const user = await this.authService.getUserProfile(userId);
      return ResponseUtil.success(res, 'User retrieved successfully', user);
    } catch (error: any) {
      logger.error(`Get current user error: ${error.message}`);
      if (error instanceof Error && error.message === 'User not found') {
        res.clearCookie(COOKIE_NAME);
        return ResponseUtil.unauthorized(res, 'User not found');
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve user');
    }
  };

  /**
   * Initiate Google Analytics OAuth flow.
   */
  initiateAnalyticsOAuth = async (req: Request, res: Response): Promise<void> => {
    try {
      const { returnUrl } = req.query as Record<string, string>;
      const safeReturnUrl = returnUrl && /^\//.test(returnUrl) ? returnUrl : undefined;
      const { url } = await this.authService.getAnalyticsAuthUrl(safeReturnUrl);
      res.redirect(url);
    } catch (error: any) {
      logger.error(`Analytics OAuth initiate error: ${error.message}`);
      res.redirect(`${env.FRONTEND_URL}/onboarding?ga_error=server_error`);
    }
  };

  /**
   * Handle Google Analytics OAuth callback.
   */
  analyticsOAuthCallback = async (req: Request, res: Response): Promise<void> => {
    const { code, error, state } = req.query;

    if (error || !code) {
      const reason = encodeURIComponent((error as string) || 'access_denied');
      res.redirect(`${env.FRONTEND_URL}/onboarding?ga_error=${reason}`);
      return;
    }

    const userId = req.user?.userId;
    if (!userId) {
      res.redirect(`${env.FRONTEND_URL}/onboarding?ga_error=unauthorized`);
      return;
    }

    try {
      await this.authService.exchangeAnalyticsCode(userId, code as string);

      let redirectTarget = `${env.FRONTEND_URL}/onboarding?ga_connected=1`;
      if (state && typeof state === 'string') {
        try {
          const decoded = JSON.parse(Buffer.from(state, 'base64').toString()) as Record<string, unknown>;
          if (typeof decoded.returnUrl === 'string' && decoded.returnUrl.startsWith('/')) {
            const sep = decoded.returnUrl.includes('?') ? '&' : '?';
            redirectTarget = `${env.FRONTEND_URL}${decoded.returnUrl}${sep}ga_connected=1`;
          }
        } catch {
          // Malformed state — fall back to onboarding
        }
      }

      res.redirect(redirectTarget);
    } catch (error: any) {
      logger.error(`Analytics OAuth callback error: ${error.message}`);
      res.redirect(`${env.FRONTEND_URL}/onboarding?ga_error=token_exchange_failed`);
    }
  };

  /**
   * Google OAuth authentication
   * Accepts a Google ID token, verifies it, and returns a JWT in a cookie.
   */
  googleAuth = async (req: Request, res: Response): Promise<Response> => {
    try {
      const data = googleAuthSchema.parse(req.body);
      const result = await this.authService.googleAuth(data);

      // Set JWT in HTTP-only cookie — same pattern as email/password auth
      res.cookie(COOKIE_NAME, result.token, cookieConfig);

      return ResponseUtil.success(res, 'Google authentication successful', result);
    } catch (error: any) {
      logger.error(`Google auth error: ${error.message}`);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      if (
        error.message === 'Invalid Google token. Please try again.' ||
        error.message === 'Google account does not have a verified email address.'
      ) {
        return ResponseUtil.error(res, error.message, undefined, 400);
      }
      if (
        error.message === 'This email is already linked to another Google account. Please log in with Google.' ||
        error.message === 'This Google account is already linked to another user'
      ) {
        return ResponseUtil.error(res, error.message, undefined, 409);
      }
      if (error.message === 'Google OAuth is not configured on this server.') {
        return ResponseUtil.serverError(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Google authentication failed');
    }
  };
}
