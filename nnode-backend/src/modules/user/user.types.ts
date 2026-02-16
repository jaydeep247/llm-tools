import { User } from '@prisma/client';
import { UserRole } from '../../shared/constants/roles';

export type UserResponse = Omit<User, 'password'>;

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface UpdateUserDto {
  email?: string;
  name?: string;
  role?: UserRole;
}

export interface UserFilters {
  email?: string;
  role?: UserRole;
}
