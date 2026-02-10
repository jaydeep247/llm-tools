import { User } from '@prisma/client';

export type UserResponse = Omit<User, 'password'>;

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  role?: 'USER' | 'ADMIN';
}

export interface UpdateUserDto {
  email?: string;
  name?: string;
  role?: 'USER' | 'ADMIN';
}

export interface UserFilters {
  email?: string;
  role?: 'USER' | 'ADMIN';
}
