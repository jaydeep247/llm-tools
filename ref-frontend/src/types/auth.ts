export enum UserRole {
  CXO = 'CXO',
  CMO = 'CMO',
  SEO_MANAGER = 'SEO_MANAGER',
  CONTENT_MANAGER = 'CONTENT_MANAGER',
  ANALYST = 'ANALYST',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
