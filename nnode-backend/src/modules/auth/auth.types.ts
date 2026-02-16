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

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
  token: string;
}
