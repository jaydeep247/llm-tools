import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ResponseUtil } from '../../utils/response';
import { signupSchema, loginSchema } from './auth.validator';
import { logger } from '../../shared/logger/logger';
import { cookieConfig, COOKIE_NAME } from '../../config/cookie';

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
      if (error.message === 'User with this email already exists') {
        return ResponseUtil.error(res, error.message, undefined, 409);
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
}
