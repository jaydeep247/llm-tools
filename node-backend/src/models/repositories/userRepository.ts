import { prisma } from '../../config/prismaClient.js';
import { User, UserSettings, UserUsage } from '../types.js';

export class UserRepository {
    constructor() { }

    async createUser(data: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<number> {
        const result = await prisma.$transaction(async (tx: any) => {
            // Create user
            const user = await tx.user.create({
                data: {
                    email: data.email,
                    passwordHash: data.passwordHash,
                    name: data.name || null,
                    isActive: data.isActive,
                    role: data.role,
                },
            });

            // Create default user settings
            await tx.userSettings.create({
                data: {
                    userId: user.id,
                    maxCrawlsPerDay: 100,
                    emailNotifications: true,
                },
            });

            return user.id;
        });

        return result;
    }

    async getUserById(id: number): Promise<User | null> {
        const user = await prisma.user.findUnique({
            where: { id },
        });

        if (!user) return null;

        return this.mapUser(user);
    }

    async getUserByEmail(email: string): Promise<User | null> {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) return null;

        return this.mapUser(user);
    }

    async updateUser(id: number, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void> {
        const updateData: any = {};

        if (updates.email !== undefined) updateData.email = updates.email;
        if (updates.passwordHash !== undefined) updateData.passwordHash = updates.passwordHash;
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.lastLogin !== undefined) updateData.lastLogin = updates.lastLogin;
        if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
        if (updates.role !== undefined) updateData.role = updates.role;

        if (Object.keys(updateData).length === 0) return;

        await prisma.user.update({
            where: { id },
            data: updateData,
        });
    }

    async updateUserLastLogin(userId: number): Promise<void> {
        await prisma.user.update({
            where: { id: userId },
            data: { lastLogin: new Date() },
        });
    }

    async deleteUser(id: number): Promise<void> {
        await prisma.user.delete({
            where: { id },
        });
    }

    async getAllUsers(limit: number = 100, offset: number = 0): Promise<User[]> {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        });

        return users.map((user: any) => this.mapUser(user));
    }

    async getUserSettings(userId: number): Promise<UserSettings | null> {
        const settings = await prisma.userSettings.findUnique({
            where: { userId },
        });

        if (!settings) return null;

        return {
            userId: settings.userId,
            openaiApiKey: settings.openaiApiKey,
            psiApiKey: settings.psiApiKey,
            maxCrawlsPerDay: settings.maxCrawlsPerDay,
            emailNotifications: settings.emailNotifications,
        };
    }

    async updateUserSettings(userId: number, updates: Partial<Omit<UserSettings, 'userId'>>): Promise<void> {
        const updateData: any = {};

        if (updates.openaiApiKey !== undefined) updateData.openaiApiKey = updates.openaiApiKey;
        if (updates.psiApiKey !== undefined) updateData.psiApiKey = updates.psiApiKey;
        if (updates.maxCrawlsPerDay !== undefined) updateData.maxCrawlsPerDay = updates.maxCrawlsPerDay;
        if (updates.emailNotifications !== undefined) updateData.emailNotifications = updates.emailNotifications;

        if (Object.keys(updateData).length === 0) return;

        await prisma.userSettings.update({
            where: { userId },
            data: updateData,
        });
    }

    async recordUserUsage(userId: number, actionType: string, creditsUsed: number = 1): Promise<void> {
        await prisma.userUsage.create({
            data: {
                userId,
                actionType,
                creditsUsed,
            },
        });
    }

    async getUserUsage(userId: number, actionType?: string, limit: number = 100): Promise<UserUsage[]> {
        const where: any = { userId };
        if (actionType) {
            where.actionType = actionType;
        }

        const usage = await prisma.userUsage.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit,
        });

        return usage.map((row: any) => ({
            id: row.id,
            userId: row.userId,
            actionType: row.actionType,
            timestamp: row.timestamp,
            creditsUsed: row.creditsUsed,
        }));
    }

    async getTodayUsageCount(userId: number, actionType: string): Promise<number> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const count = await prisma.userUsage.count({
            where: {
                userId,
                actionType,
                timestamp: {
                    gte: today,
                },
            },
        });

        return count;
    }

    async getUserUsageStats(userId: number, since?: string): Promise<any> {
        const where: any = { userId };
        if (since) {
            where.timestamp = { gte: new Date(since) };
        }

        const stats = await prisma.userUsage.groupBy({
            by: ['actionType'],
            where,
            _count: {
                id: true,
            },
            _sum: {
                creditsUsed: true,
            },
        });

        return stats.map((stat: any) => ({
            type: stat.actionType,
            count: stat._count.id,
            credits: stat._sum.creditsUsed || 0,
        }));
    }

    private mapUser(user: any): User {
        return {
            id: user.id,
            email: user.email,
            passwordHash: user.passwordHash,
            name: user.name,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            isActive: user.isActive,
            role: user.role,
        };
    }
}
