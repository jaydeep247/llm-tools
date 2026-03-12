import { Request, Response } from 'express';
import { UserRepository } from '../user/user.repository';
import { ResponseUtil } from '../../utils/response';
import { userIdSchema } from '../user/user.validator';
import { logger } from '../../shared/logger/logger';
import { UserRole } from '../../shared/constants/roles';

/**
 * AdminUsersController — read-only access to the `users` collection.
 * Admins can list and inspect users; they cannot create, update or delete.
 */
export class AdminUsersController {
  private repo = new UserRepository();

  /** GET /admin/users?role=&search= */
  listUsers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { role, search } = req.query as { role?: string; search?: string };
      // Validate role filter — only user roles are valid here (no ADMIN)
      const validRoles = Object.values(UserRole) as string[];
      const roleFilter = role && validRoles.includes(role) ? (role as UserRole) : undefined;

      let users = await this.repo.findAll(roleFilter ? { role: roleFilter } : undefined);

      if (search) {
        const q = search.toLowerCase();
        users = users.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q),
        );
      }

      return ResponseUtil.success(
        res,
        'Users retrieved',
        users.map((u) => this.repo.sanitizeUser(u)),
      );
    } catch (err: any) {
      logger.error(`Admin listUsers: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve users');
    }
  };

  /** GET /admin/users/:id */
  getUser = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = userIdSchema.parse(req.params);
      const user = await this.repo.findById(id);
      if (!user) return ResponseUtil.notFound(res, 'User not found');
      return ResponseUtil.success(res, 'User retrieved', this.repo.sanitizeUser(user));
    } catch (err: any) {
      logger.error(`Admin getUser: ${err.message}`);
      if (err.name === 'ZodError') return ResponseUtil.error(res, 'Invalid user ID', err.errors);
      return ResponseUtil.serverError(res, 'Failed to retrieve user');
    }
  };
}
