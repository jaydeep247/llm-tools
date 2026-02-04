import express from 'express';
import { getDatabase } from '../services/DatabaseService.js';
import { authenticateUser } from '../middleware/authMiddleware.js';
import { Logger } from '../helpers/logging/Logger.js';

const router = express.Router();
const logger = Logger.getInstance();

// Get all projects for a user
router.get('/projects', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const db = getDatabase();
        
        const projects = await db.getUserProjects(userId);
        
        res.json({
            success: true,
            projects
        });
    } catch (error) {
        logger.error('Failed to get projects', error as Error);
        res.status(500).json({ error: 'Failed to get projects' });
    }
});

// Get a specific project with its sessions
router.get('/projects/:projectId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const projectId = req.params.projectId;

        const db = getDatabase();
        const project = await db.getProjectWithSessions(projectId, userId);

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.json({
            success: true,
            project
        });
    } catch (error) {
        logger.error('Failed to get project', error as Error);
        res.status(500).json({ error: 'Failed to get project' });
    }
});

// Create a new project
router.post('/projects', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const { name, description } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const db = getDatabase();
        const project = await db.createProject({
            name: name.trim(),
            description: description?.trim() || null,
            userId
        });

        logger.info('Project created', { projectId: project.id, userId });
        res.status(201).json({
            success: true,
            project
        });
    } catch (error) {
        logger.error('Failed to create project', error as Error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// Update a project
router.put('/projects/:projectId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const projectId = req.params.projectId;
        const { name, description, isActive } = req.body;

        const db = getDatabase();
        
        // Verify ownership
        const project = await db.getProject(projectId, userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const updatedProject = await db.updateProject(projectId, {
            name: name?.trim(),
            description: description?.trim(),
            isActive
        });

        logger.info('Project updated', { projectId, userId });
        res.json({
            success: true,
            project: updatedProject
        });
    } catch (error) {
        logger.error('Failed to update project', error as Error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// Delete a project (and all its sessions)
router.delete('/projects/:projectId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const projectId = req.params.projectId;

        const db = getDatabase();
        
        // Verify ownership
        const project = await db.getProject(projectId, userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        await db.deleteProject(projectId);

        logger.info('Project deleted', { projectId, userId });
        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (error) {
        logger.error('Failed to delete project', error as Error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// Get sessions for a project
router.get('/projects/:projectId/sessions', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const projectId = req.params.projectId;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const db = getDatabase();
        
        // Verify ownership
        const project = await db.getProject(projectId, userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const sessions = await db.getProjectSessions(projectId, limit, offset);

        res.json({
            success: true,
            sessions,
            pagination: {
                limit,
                offset,
                hasMore: sessions.length === limit
            }
        });
    } catch (error) {
        logger.error('Failed to get project sessions', error as Error);
        res.status(500).json({ error: 'Failed to get project sessions' });
    }
});

// Get a specific session by ID
router.get('/sessions/:sessionId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const sessionId = parseInt(req.params.sessionId);

        if (isNaN(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        const db = getDatabase();
        
        // Get the session
        const session = await db.getCrawlSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Verify the session belongs to a project owned by the user
        const project = await db.getProject(session.projectId, userId);
        if (!project) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({
            success: true,
            session
        });
    } catch (error) {
        logger.error('Failed to get session', error as Error);
        res.status(500).json({ error: 'Failed to get session' });
    }
});

export default router;
