import { Router } from 'express';
import { AdminUsersController } from './admin-users.controller';
import { adminMiddleware } from '../../middlewares/admin.middleware';

const router = Router();
const controller = new AdminUsersController();

// Admin user routes are read-only — no create / update / delete.
router.use(adminMiddleware);

router.get('/', controller.listUsers);
router.get('/:id', controller.getUser);

export default router;
