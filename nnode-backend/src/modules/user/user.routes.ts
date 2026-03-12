import { Router } from 'express';
import { UserController } from './user.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const userController = new UserController();

// All user routes require authentication
router.use(authMiddleware);

// Get all users
router.get('/', userController.getAllUsers);

// Get user by ID
router.get('/:id', userController.getUserById);

// Update user
router.put('/:id', userController.updateUser);

// Delete user
router.delete('/:id', userController.deleteUser);

export default router;
