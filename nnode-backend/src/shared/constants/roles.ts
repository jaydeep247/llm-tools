export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export const ROLES = {
  USER: UserRole.USER,
  ADMIN: UserRole.ADMIN,
} as const;
