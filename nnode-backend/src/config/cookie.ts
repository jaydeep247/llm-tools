import { CookieOptions } from 'express';
import { env } from './env';

export const cookieConfig: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: env.COOKIE_MAX_AGE,
  path: '/',
} as const;

export const COOKIE_NAME = 'access_token';
