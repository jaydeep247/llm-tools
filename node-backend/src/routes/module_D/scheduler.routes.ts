import { Router } from 'express';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { Logger } from '../../helpers/logging/Logger.js';
import { getSchedulerService } from '../../services/scheduler/index.js';

const router = Router();
const logger = Logger.getInstance();

// Schedule management routes (protected)
router.get('/schedules', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const schedulerService = getSchedulerService();
        const scheduleManager = schedulerService.getScheduleManager();
        const allSchedules = await scheduleManager.getAllSchedules();

        // Filter schedules by user (admins can see all)
        const schedules = req.user!.role === 'admin'
            ? allSchedules
            : allSchedules.filter((s: any) => s.userId === userId);

        res.json({ schedules });
    } catch (error) {
        logger.error('Failed to get schedules', error as Error);
        res.status(500).json({ error: 'Failed to get schedules' });
    }
});

router.post('/schedules', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const schedulerService = getSchedulerService();
        const scheduleManager = schedulerService.getScheduleManager();

        // Add userId to schedule data
        const scheduleData = { ...req.body, userId };
        const scheduleId = await scheduleManager.createSchedule(scheduleData);

        logger.info('Schedule created', { userId, scheduleId });
        res.json({ id: scheduleId, message: 'Schedule created successfully' });
    } catch (error) {
        logger.error('Failed to create schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

router.get('/schedules/:id', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const schedulerService = getSchedulerService();
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can access all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ schedule });
    } catch (error) {
        logger.error('Failed to get schedule', error as Error);
        res.status(500).json({ error: 'Failed to get schedule' });
    }
});

router.put('/schedules/:id', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const schedulerService = getSchedulerService();
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can update all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await scheduleManager.updateSchedule(parseInt(req.params.id), req.body);
        res.json({ message: 'Schedule updated successfully' });
    } catch (error) {
        logger.error('Failed to update schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

router.delete('/schedules/:id', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const schedulerService = getSchedulerService();
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can delete all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await scheduleManager.deleteSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule deleted successfully' });
    } catch (error) {
        logger.error('Failed to delete schedule', error as Error);
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

router.post('/schedules/:id/toggle', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const schedulerService = getSchedulerService();
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can toggle all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await scheduleManager.toggleSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule toggled successfully' });
    } catch (error) {
        logger.error('Failed to toggle schedule', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

router.post('/schedules/:id/trigger', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const schedulerService = getSchedulerService();
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can trigger all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await schedulerService.triggerSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule triggered successfully' });
    } catch (error) {
        logger.error('Failed to trigger schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

router.get('/schedules/:id/executions', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = getSchedulerService().getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can view all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const executions = scheduleManager.getExecutionHistory(parseInt(req.params.id), limit);
        res.json({ executions });
    } catch (error) {
        logger.error('Failed to get schedule executions', error as Error);
        res.status(500).json({ error: 'Failed to get schedule executions' });
    }
});

router.get('/schedules/:id/stats', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const schedulerService = getSchedulerService();
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can view all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const stats = scheduleManager.getScheduleStats(parseInt(req.params.id));
        res.json({ stats });
    } catch (error) {
        logger.error('Failed to get schedule stats', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

router.get('/scheduler/status', authenticateUser, (req, res) => {
    try {
        const schedulerService = getSchedulerService();
        const status = schedulerService.getStatus();
        res.json({ status });
    } catch (error) {
        logger.error('Failed to get scheduler status', error as Error);
        res.status(500).json({ error: 'Failed to get scheduler status' });
    }
});

router.post('/scheduler/validate-cron', authenticateUser, (req, res) => {
    try {
        const { cronExpression } = req.body;
        if (!cronExpression) {
            return res.status(400).json({ error: 'cronExpression is required' });
        }

        const schedulerService = getSchedulerService();
        const scheduleManager = schedulerService.getScheduleManager();
        const validation = scheduleManager.validateCronExpression(cronExpression);
        const description = scheduleManager.getCronDescription(cronExpression);

        res.json({ validation, description });
    } catch (error) {
        logger.error('Failed to validate cron expression', error as Error);
        res.status(500).json({ error: 'Failed to validate cron expression' });
    }
});

export default router;
