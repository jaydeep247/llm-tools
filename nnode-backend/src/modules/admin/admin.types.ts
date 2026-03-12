/**
 * AdminEntity lives in the `admins` collection — completely separate from
 * the `users` collection.  Admins are not users and cannot log in via the
 * regular auth flow.
 */
export interface AdminEntity {
  id: string;
  email: string;
  password: string;
  name: string;
  role: 'ADMIN';          // always 'ADMIN' — no other values allowed
  createdAt: Date;
  updatedAt: Date;
}

export type AdminResponse = Omit<AdminEntity, 'password'>;
