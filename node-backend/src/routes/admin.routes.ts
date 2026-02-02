import express, { Request, Response } from 'express';
import { getDatabase } from '../services/DatabaseService.js';
import { authenticateUser, requireAdmin } from '../middleware/authMiddleware.js';
import { Logger } from '../helpers/logging/Logger.js';

const router = express.Router();
const db = getDatabase();
const logger = Logger.getInstance();

/**
 * GET /api/admin/users
 * Get all users with their details (Admin only)
 */
router.get('/users', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 50, search = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        
        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.min(100, Math.max(1, Number(limit)));
        const offset = (pageNum - 1) * limitNum;

        // Get all users from database
        const users = await db.prisma.user.findMany({
            where: search ? {
                OR: [
                    { email: { contains: String(search), mode: 'insensitive' } },
                    { name: { contains: String(search), mode: 'insensitive' } },
                ],
            } : undefined,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                lastLogin: true,
                isActive: true,
            },
            orderBy: {
                [String(sortBy)]: sortOrder === 'asc' ? 'asc' : 'desc',
            },
            skip: offset,
            take: limitNum,
        });

        // Get total count for pagination
        const totalCount = await db.prisma.user.count({
            where: search ? {
                OR: [
                    { email: { contains: String(search), mode: 'insensitive' } },
                    { name: { contains: String(search), mode: 'insensitive' } },
                ],
            } : undefined,
        });

        // Get usage statistics for each user
        const usersWithStats = await Promise.all(
            users.map(async (user) => {
                const stats = await db.getUserUsageStats(user.id);
                return {
                    ...user,
                    stats: {
                        totalCrawls: stats.totalCrawls || 0,
                        totalAudits: stats.totalAudits || 0,
                        totalAeoAnalyses: stats.totalAeoAnalyses || 0,
                    },
                };
            })
        );

        res.json({
            users: usersWithStats,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitNum),
            },
        });
    } catch (error) {
        logger.error('Error fetching users for admin', error as Error);
        res.status(500).json({
            error: 'Failed to fetch users',
            message: 'An error occurred while fetching user data',
        });
    }
});

/**
 * GET /api/admin/users/:userId
 * Get detailed user information (Admin only)
 */
router.get('/users/:userId', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.userId, 10);

        if (isNaN(userId)) {
            return res.status(400).json({
                error: 'Invalid user ID',
            });
        }

        const user = await db.prisma.user.findUnique({
            where: { id: userId },
            include: {
                userSettings: true,
                userUsage: {
                    orderBy: { timestamp: 'desc' },
                    take: 30, // Last 30 records
                },
            },
        });

        if (!user) {
            return res.status(404).json({
                error: 'User not found',
            });
        }

        const stats = await db.getUserUsageStats(userId);

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                isActive: user.isActive,
            },
            settings: user.userSettings,
            stats,
            recentUsage: user.userUsage,
        });
    } catch (error) {
        logger.error('Error fetching user details for admin', error as Error);
        res.status(500).json({
            error: 'Failed to fetch user details',
            message: 'An error occurred while fetching user data',
        });
    }
});

/**
 * PUT /api/admin/users/:userId/role
 * Update user role (Admin only)
 */
router.put('/users/:userId/role', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        const { role } = req.body;

        if (isNaN(userId)) {
            return res.status(400).json({
                error: 'Invalid user ID',
            });
        }

        if (!['user', 'admin', 'premium'].includes(role)) {
            return res.status(400).json({
                error: 'Invalid role',
                message: 'Role must be one of: user, admin, premium',
            });
        }

        // Prevent admin from demoting themselves
        if (userId === req.user?.userId && role !== 'admin') {
            return res.status(400).json({
                error: 'Cannot change own role',
                message: 'You cannot change your own admin role',
            });
        }

        const updatedUser = await db.prisma.user.update({
            where: { id: userId },
            data: { role },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
            },
        });

        logger.info(`Admin ${req.user?.email} changed user ${updatedUser.email} role to ${role}`);

        res.json({
            message: 'User role updated successfully',
            user: updatedUser,
        });
    } catch (error) {
        logger.error('Error updating user role', error as Error);
        res.status(500).json({
            error: 'Failed to update user role',
            message: 'An error occurred while updating the user role',
        });
    }
});

/**
 * PUT /api/admin/users/:userId/status
 * Update user active status (Admin only)
 */
router.put('/users/:userId/status', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        const { isActive } = req.body;

        if (isNaN(userId)) {
            return res.status(400).json({
                error: 'Invalid user ID',
            });
        }

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({
                error: 'Invalid status',
                message: 'isActive must be a boolean value',
            });
        }

        // Prevent admin from deactivating themselves
        if (userId === req.user?.userId && !isActive) {
            return res.status(400).json({
                error: 'Cannot deactivate own account',
                message: 'You cannot deactivate your own account',
            });
        }

        const updatedUser = await db.prisma.user.update({
            where: { id: userId },
            data: { isActive },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
            },
        });

        logger.info(`Admin ${req.user?.email} ${isActive ? 'activated' : 'deactivated'} user ${updatedUser.email}`);

        res.json({
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            user: updatedUser,
        });
    } catch (error) {
        logger.error('Error updating user status', error as Error);
        res.status(500).json({
            error: 'Failed to update user status',
            message: 'An error occurred while updating the user status',
        });
    }
});

/**
 * GET /api/admin/stats
 * Get platform statistics (Admin only)
 */
router.get('/stats', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const [totalUsers, activeUsers, adminUsers, premiumUsers] = await Promise.all([
            db.prisma.user.count(),
            db.prisma.user.count({ where: { isActive: true } }),
            db.prisma.user.count({ where: { role: 'admin' } }),
            db.prisma.user.count({ where: { role: 'premium' } }),
        ]);

        // Get total usage
        const usageStats = await db.prisma.userUsage.aggregate({
            _sum: {
                creditsUsed: true,
            },
            _count: true,
        });

        // Get recent signups (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSignups = await db.prisma.user.count({
            where: {
                createdAt: { gte: thirtyDaysAgo },
            },
        });

        // Get active users (logged in last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const activeUsersWeek = await db.prisma.user.count({
            where: {
                lastLogin: { gte: sevenDaysAgo },
            },
        });

        res.json({
            users: {
                total: totalUsers,
                active: activeUsers,
                admins: adminUsers,
                premium: premiumUsers,
                recentSignups,
                activeLastWeek: activeUsersWeek,
            },
            usage: {
                totalActions: usageStats._count || 0,
                totalCreditsUsed: usageStats._sum?.creditsUsed || 0,
            },
        });
    } catch (error) {
        logger.error('Error fetching admin stats', error as Error);
        res.status(500).json({
            error: 'Failed to fetch statistics',
            message: 'An error occurred while fetching platform statistics',
        });
    }
});

export default router;
