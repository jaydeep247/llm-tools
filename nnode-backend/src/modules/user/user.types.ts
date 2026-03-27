import { UserRole } from '../../shared/constants/roles';

export type AuthProvider = 'email' | 'google' | 'both';

export interface GoogleAnalyticsIntegration {
  connected: boolean;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
}

export interface UserEntity {
  id: string;
  email: string;
  emailNormalized?: string;
  password?: string;
  name: string;
  role: UserRole;
  googleId?: string;
  authProvider: AuthProvider;
  createdAt: Date;
  updatedAt: Date;
  hasNew?: boolean;
  onboardingData?: {
    role?: string;
    organizationType?: string;
    focusArea?: string;
  };
  /** Google Analytics integration — stored separately from login tokens */
  googleAnalytics?: GoogleAnalyticsIntegration;
}

export type UserResponse = Omit<UserEntity, 'password'>;

export interface CreateUserDto {
  email: string;
  emailNormalized?: string;
  password?: string;
  name: string;
  role?: UserRole;
  googleId?: string;
  authProvider?: AuthProvider;
}

export interface UpdateUserDto {
  email?: string;
  emailNormalized?: string;
  name?: string;
  role?: UserRole;
  googleId?: string;
  authProvider?: AuthProvider;
  hasNew?: boolean;
  onboardingData?: {
    role?: string;
    organizationType?: string;
    focusArea?: string;
  };
  googleAnalytics?: GoogleAnalyticsIntegration;
}

export interface UserFilters {
  email?: string;
  role?: UserRole;
}
