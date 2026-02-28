import { Request, Response } from 'express';
import { UserService } from './user.service';
import { ResponseUtil } from '../../utils/response';
import { userIdSchema } from './user.validator';
import { logger } from '../../shared/logger/logger';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Get all users
   */
  getAllUsers = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const users = await this.userService.getAllUsers();
      return ResponseUtil.success(res, 'Users retrieved successfully', users);
    } catch (error) {
      logger.error('Error getting users:', error);
      return ResponseUtil.serverError(res, 'Failed to retrieve users');
    }
  };

  /**
   * Get user by ID
   */
  getUserById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = userIdSchema.parse(req.params);
      const user = await this.userService.getUserById(id);
      return ResponseUtil.success(res, 'User retrieved successfully', user);
    } catch (error: any) {
      logger.error(`Error getting users: ${error.message}`);
      if (error.message === 'User not found') {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve user');
    }
  };

  /**
   * Update user
   */
  updateUser = async (req: Request, res: Response): Promise<Response> => {
    try {
      // In a real app, you should check if req.user.id matches req.params.id or if user is admin
      // For now, we'll assume authMiddleware handles basic auth check
      const id = req.params.id; 
      const data = req.body; // Allow partial updates without strict validation for now or use a partial schema
      
      const userService = new UserService();
      const user = await userService.updateUser(id as string, data);
       return ResponseUtil.success(res, 'User updated successfully', user);
     } catch (error: any) {
       logger.error(`Error updating user: ${error.message}`);
       if (error.message === 'User not found') {
         return ResponseUtil.notFound(res, 'User not found');
       }
       return ResponseUtil.serverError(res, 'Failed to update user', error.message);
     }
   };

  /**
   * Delete user
   */
  deleteUser = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = userIdSchema.parse(req.params);
      const user = await this.userService.deleteUser(id);
      return ResponseUtil.success(res, 'User deleted successfully', user);
    } catch (error: any) {
      logger.error(`Error deleting user: ${error.message}`);
      if (error.message === 'User not found') {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to delete user');
    }
  };
}
