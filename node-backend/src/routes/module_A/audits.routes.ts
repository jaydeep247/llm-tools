import { Router } from 'express';
import { listRecent, getById } from '../../services/module_A/audits/reader.js';
import auditSchedulerRoutes from './audit.routes.js';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { getDatabase } from '../../services/DatabaseService.js';

export const auditsRoutes = Router();

auditsRoutes.get('/audits', authenticateUser, async (req, res) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const device = (req.query.device as string) || 'all';
        const limit = Math.min(500, Number(req.query.limit) || 100);
        const sessionIdParam = req.query.sessionId;
        const sessionId = sessionIdParam != null && sessionIdParam !== '' ? Number(sessionIdParam) : undefined;

        if (sessionId != null) {
            const db = getDatabase();
            const session = await db.getCrawlSession(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }
            const sessionUserId = session.userId;
            const isAdmin = (req as any).user?.role === 'admin';
            if (sessionUserId !== userId && !isAdmin) {
                return res.status(403).json({ error: 'Access denied to this session' });
            }
        }

        const items = await listRecent(
            device === 'mobile' || device === 'desktop' ? (device as any) : 'all',
            limit,
            sessionId,
            sessionId == null ? userId : undefined
        );

        res.json({ items });
    } catch (e) {
        res.status(500).json({ error: 'Failed to list audits' });
    }
});

auditsRoutes.get('/audits/:id', authenticateUser, async (req, res) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        const id = req.params.id;
        const db = getDatabase();
        const numId = parseInt(id, 10);
        if (!Number.isNaN(numId)) {
            const audit = await db.getAuditResultById(numId);
            if (audit) {
                const sessionId = (audit as any).sessionId ?? (audit as any).session_id;
                if (sessionId != null) {
                    const session = await db.getCrawlSession(sessionId);
                    if (session) {
                        const sessionUserId = session.userId;
                        const isAdmin = (req as any).user?.role === 'admin';
                        if (sessionUserId !== userId && !isAdmin) {
                            return res.status(403).json({ error: 'Access denied to this audit' });
                        }
                    }
                }
            }
        }

        const data = await getById(id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json({ data });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load audit' });
    }
});

// Add audit scheduler routes
auditsRoutes.use('/audit-schedules', auditSchedulerRoutes);
