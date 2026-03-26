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
    onboardingData?: {
      role?: string;
      organizationType?: string;
      focusArea?: string;
    };
  };
  token: string;
}
