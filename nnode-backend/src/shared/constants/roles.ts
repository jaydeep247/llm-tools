export enum UserRole {
  CXO = 'CXO',
  CMO = 'CMO',
  SEO_MANAGER = 'SEO_MANAGER',
  CONTENT_MANAGER = 'CONTENT_MANAGER',
  ANALYST = 'ANALYST',
  ADMIN = 'ADMIN', // Keep for system admin
}

export const ROLES = {
  CXO: UserRole.CXO,
  CMO: UserRole.CMO,
  SEO_MANAGER: UserRole.SEO_MANAGER,
  CONTENT_MANAGER: UserRole.CONTENT_MANAGER,
  ANALYST: UserRole.ANALYST,
  ADMIN: UserRole.ADMIN,
} as const;

export type UserRoleType = keyof typeof ROLES;
