export enum UserRole {
  CXO = 'CXO',
  CMO = 'CMO',
  SEO_MANAGER = 'SEO_MANAGER',
  CONTENT_MANAGER = 'CONTENT_MANAGER',
  ANALYST = 'ANALYST',
}

export interface OnboardingState {
  status: 'in_progress' | 'completed';
  currentFlow?: 'core' | 'brand';
  currentStep?: number;
  resumePath?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  hasNew?: boolean;
  onboardingState?: OnboardingState;
  onboardingData?: {
    role?: string;
    organizationType?: string;
    focusArea?: string;
  };
  /** Google Analytics integration status — separate from login OAuth */
  googleAnalytics?: {
    connected: boolean;
  };
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

export interface GoogleAuthRequest {
  idToken: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
