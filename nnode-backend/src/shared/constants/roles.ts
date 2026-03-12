/**
 * Roles for regular platform users.  Admin is intentionally excluded —
 * admins are stored in a separate `admins` collection and are not users.
 */
export enum UserRole {
  CXO = 'CXO',
  CMO = 'CMO',
  SEO_MANAGER = 'SEO_MANAGER',
  CONTENT_MANAGER = 'CONTENT_MANAGER',
  ANALYST = 'ANALYST',
}

export const ROLES = {
  CXO: UserRole.CXO,
  CMO: UserRole.CMO,
  SEO_MANAGER: UserRole.SEO_MANAGER,
  CONTENT_MANAGER: UserRole.CONTENT_MANAGER,
  ANALYST: UserRole.ANALYST,
} as const;

export type UserRoleType = keyof typeof ROLES;

/**
 * Admin role string — used only for the `admins` collection and JWT payloads
 * issued by the admin auth flow.  Never stored in the `users` collection.
 */
export const ADMIN_ROLE = 'ADMIN' as const;
export type AdminRoleType = typeof ADMIN_ROLE;
