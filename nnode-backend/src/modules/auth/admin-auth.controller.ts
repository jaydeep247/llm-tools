import { Request, Response } from 'express';
import { AdminRepository } from '../admin/admin.repository';
import { PasswordUtil } from '../../utils/password';
import { JwtUtil } from '../../utils/jwt';
import { ResponseUtil } from '../../utils/response';
import { loginSchema } from './auth.validator';
import { logger } from '../../shared/logger/logger';
import { ADMIN_COOKIE_NAME, cookieConfig } from '../../config/cookie';
import { ADMIN_ROLE } from '../../shared/constants/roles';

// Single constant used in every branch that must return 401 so that error
// messages are identical regardless of whether the account doesn't exist,
// the password is wrong, or the account is not an admin role. This prevents
// user enumeration and role-oracle attacks.
const INVALID_CREDENTIALS = 'Invalid credentials';

export class AdminAuthController {
  private adminRepository = new AdminRepository();

  /**
   * POST /auth/admin/login
   * Accepts email + password, verifies the account exists and has role ADMIN,
   * then issues a separate `admin_token` HTTP-only cookie.
   */
  login = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const admin = await this.adminRepository.findByEmail(email);
      if (!admin) {
        return ResponseUtil.unauthorized(res, INVALID_CREDENTIALS);
      }

      const passwordValid = await PasswordUtil.compare(password, admin.password);
      if (!passwordValid) {
        return ResponseUtil.unauthorized(res, INVALID_CREDENTIALS);
      }

      const token = JwtUtil.sign({
        userId: admin.id,
        email: admin.email,
        role: ADMIN_ROLE,
      });

      res.cookie(ADMIN_COOKIE_NAME, token, cookieConfig);

      return ResponseUtil.success(res, 'Admin login successful', {
        user: { id: admin.id, email: admin.email, name: admin.name, role: ADMIN_ROLE },
      });
    } catch (error: any) {
      logger.error(`Admin login error: ${error.message}`);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Login failed');
    }
  };

  /**
   * POST /auth/admin/logout
   * Clears the admin_token cookie.
   */
  logout = async (_req: Request, res: Response): Promise<Response> => {
    res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
    return ResponseUtil.success(res, 'Admin logout successful', null);
  };

  /**
   * GET /auth/admin/me
   * Returns the currently authenticated admin's profile.
   */
  getMe = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user) {
        return ResponseUtil.unauthorized(res, 'Not authenticated');
      }

      const admin = await this.adminRepository.findById(req.user.userId);
      if (!admin) {
        return ResponseUtil.unauthorized(res, 'Not authenticated');
      }

      return ResponseUtil.success(res, 'Admin profile', this.adminRepository.sanitize(admin));
    } catch (error: any) {
      logger.error(`Admin getMe error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to get admin profile');
    }
  };
}
