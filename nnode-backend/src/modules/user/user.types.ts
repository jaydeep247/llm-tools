import { UserRole } from '../../shared/constants/roles';

export interface UserEntity {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type UserResponse = Omit<UserEntity, 'password'>;

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
