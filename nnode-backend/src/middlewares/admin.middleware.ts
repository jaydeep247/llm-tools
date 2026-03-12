import { Request, Response, NextFunction } from 'express';
import { JwtUtil } from '../utils/jwt';
import { ResponseUtil } from '../utils/response';
import { ADMIN_COOKIE_NAME } from '../config/cookie';
import { ADMIN_ROLE } from '../shared/constants/roles';
import { logger } from '../shared/logger/logger';

/**
 * adminMiddleware — guards routes that must only be accessible to ADMIN-role users.
 *
 * Checks the dedicated `admin_token` cookie (separate from the regular
 * `access_token` so ordinary user sessions can never bleed into admin routes).
 * Rejects with 401 when the cookie is absent or the token is invalid/expired,
 * and with 403 when the token is valid but the role is not ADMIN.
 */
export const adminMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = req.cookies[ADMIN_COOKIE_NAME];

    if (!token) {
      ResponseUtil.unauthorized(res, 'Admin authentication required');
      return;
    }

    const payload = JwtUtil.verify(token);

    if (payload.role !== ADMIN_ROLE) {
      ResponseUtil.forbidden(res, 'Admin access only');
      return;
    }

    req.user = payload;
    next();
  } catch (error: any) {
    logger.error(`Admin middleware error: ${error.message}`);
    ResponseUtil.unauthorized(res, 'Admin authentication failed');
  }
};
