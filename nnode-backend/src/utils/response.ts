import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export class ResponseUtil {
  /**
   * Send success response
   */
  static success<T>(res: Response, message: string, data?: T, statusCode: number = 200): Response {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
    };
    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  static error(res: Response, message: string, error?: string, statusCode: number = 400): Response {
    const response: ApiResponse = {
      success: false,
      message,
      error,
    };
    return res.status(statusCode).json(response);
  }

  /**
   * Send created response
   */
  static created<T>(res: Response, message: string, data?: T): Response {
    return ResponseUtil.success(res, message, data, 201);
  }

  /**
   * Send unauthorized response
   */
  static unauthorized(res: Response, message: string = 'Unauthorized'): Response {
    return ResponseUtil.error(res, message, undefined, 401);
  }

  /**
   * Send forbidden response
   */
  static forbidden(res: Response, message: string = 'Forbidden'): Response {
    return ResponseUtil.error(res, message, undefined, 403);
  }

  /**
   * Send not found response
   */
  static notFound(res: Response, message: string = 'Resource not found'): Response {
    return ResponseUtil.error(res, message, undefined, 404);
  }

  /**
   * Send internal server error response
   */
  static serverError(res: Response, message: string = 'Internal server error', error?: string): Response {
    return ResponseUtil.error(res, message, error, 500);
  }
}
