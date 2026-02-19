import { Router } from 'express';
import { ProjectController } from './project.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const projectController = new ProjectController();

// All project routes require authentication
router.use(authMiddleware);

// Create project
router.post('/', projectController.createProject);

// Get all projects for authenticated user
router.get('/', projectController.getUserProjects);

// Get project by ID
router.get('/:id', projectController.getProjectById);

// Update project
router.put('/:id', projectController.updateProject);

// Delete project (hard delete)
router.delete('/:id', projectController.archiveProject);

export default router;
