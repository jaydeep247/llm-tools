import { Router } from 'express';
import { UserController } from './user.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/role.middleware';
import { ROLES } from '../../shared/constants/roles';

const router = Router();
const userController = new UserController();

// All user routes require authentication
router.use(authMiddleware);

// Get all users (admin only)
router.get('/', roleMiddleware([ROLES.ADMIN]), userController.getAllUsers);

// Get user by ID
router.get('/:id', userController.getUserById);

// Update user
router.put('/:id', userController.updateUser);

// Delete user (admin only)
router.delete('/:id', roleMiddleware([ROLES.ADMIN]), userController.deleteUser);

export default router;
