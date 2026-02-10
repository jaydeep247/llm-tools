import { Request, Response, NextFunction } from 'express';
import { JwtUtil } from '../utils/jwt';
import { ResponseUtil } from '../utils/response';
import { COOKIE_NAME } from '../config/cookie';
import { logger } from '../shared/logger/logger';

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Get token from cookie or Authorization header
    let token = req.cookies[COOKIE_NAME];

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      ResponseUtil.unauthorized(res, 'No token provided');
      return;
    }

    // Verify token
    const payload = JwtUtil.verify(token);

    // Attach user to request
    req.user = payload;

    next();
  } catch (error: any) {
    logger.error('Auth middleware error:', error);
    if (error.message === 'Invalid or expired token') {
      ResponseUtil.unauthorized(res, error.message);
      return;
    }
    ResponseUtil.unauthorized(res, 'Authentication failed');
  }
};
