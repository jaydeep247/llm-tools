import { Request, Response, NextFunction } from 'express';
import { ResponseUtil } from '../utils/response';
import { logger } from '../shared/logger/logger';
import { ZodError } from 'zod';

export const errorMiddleware = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error(`Error: ${error.message}`);

  // Zod validation errors
  if (error instanceof ZodError) {
    ResponseUtil.error(res, 'Validation failed', JSON.stringify(error.errors), 400);
    return;
  }

  // Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    ResponseUtil.error(res, 'Database error', error.message, 400);
    return;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    ResponseUtil.unauthorized(res, 'Invalid or expired token');
    return;
  }

  // Default error
  ResponseUtil.serverError(res, 'Internal server error', error.message);
};
