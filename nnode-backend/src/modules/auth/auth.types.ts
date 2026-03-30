import { UserRole } from '../../shared/constants/roles';

export interface SignupDto {
  email: string;
  password: string;
  name: string;
  role: UserRole; // REQUIRED field for signup
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface GoogleAuthDto {
  /** Google ID token obtained from Google Identity Services on the client */
  idToken: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    hasNew?: boolean;
    onboardingState?: {
      status: 'in_progress' | 'completed';
      currentFlow?: 'core' | 'brand';
      currentStep?: number;
      resumePath?: string;
    };
    onboardingData?: {
      role?: string;
      organizationType?: string;
      focusArea?: string;
    };
    googleAnalytics?: {
      connected: boolean;
      selectedPropertyId?: string | null;
    };
  };
  token: string;
}
