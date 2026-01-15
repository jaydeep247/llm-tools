import { Pool } from 'pg';
import { User, UserSettings, UserUsage } from '../types.js';

export class UserRepository {
    constructor(private pool: Pool) { }

    private safeInt(val: any): number | null {
        if (val === undefined || val === null) return null;
        if (typeof val === 'number') return Math.round(val);
        const parsed = parseFloat(val);
        return isNaN(parsed) ? null : Math.round(parsed);
    }

    async createUser(data: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<number> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const userRes = await client.query(
                `INSERT INTO users (email, password_hash, name, created_at, is_active, role)
         VALUES ($1, $2, $3, NOW(), $4, $5)
         RETURNING id`,
                [data.email, data.passwordHash, data.name || null, data.isActive, data.role]
            );

            const userId = userRes.rows[0].id;

            // Create default user settings
            await client.query(
                `INSERT INTO user_settings (user_id, max_crawls_per_day, email_notifications)
         VALUES ($1, 100, TRUE)`,
                [userId]
            );

            await client.query('COMMIT');
            return userId;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async getUserById(id: number): Promise<User | null> {
        const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (res.rows.length === 0) return null;
        return this.mapUser(res.rows[0]);
    }

    async getUserByEmail(email: string): Promise<User | null> {
        const res = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (res.rows.length === 0) return null;
        return this.mapUser(res.rows[0]);
    }

    async updateUser(id: number, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (updates.email !== undefined) { fields.push(`email = $${idx++}`); values.push(updates.email); }
        if (updates.passwordHash !== undefined) { fields.push(`password_hash = $${idx++}`); values.push(updates.passwordHash); }
        if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
        if (updates.lastLogin !== undefined) { fields.push(`last_login = $${idx++}`); values.push(updates.lastLogin); }
        if (updates.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(updates.isActive); }
        if (updates.role !== undefined) { fields.push(`role = $${idx++}`); values.push(updates.role); }

        if (fields.length === 0) return;

        values.push(id);
        await this.pool.query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`,
            values
        );
    }

    async updateUserLastLogin(userId: number): Promise<void> {
        await this.pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [userId]);
    }

    async deleteUser(id: number): Promise<void> {
        await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    }

    async getAllUsers(limit: number = 100, offset: number = 0): Promise<User[]> {
        const res = await this.pool.query(
            'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );
        return res.rows.map(row => this.mapUser(row));
    }

    async getUserSettings(userId: number): Promise<UserSettings | null> {
        const res = await this.pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        return {
            userId: row.user_id,
            openaiApiKey: row.openai_api_key,
            psiApiKey: row.psi_api_key,
            maxCrawlsPerDay: row.max_crawls_per_day,
            emailNotifications: row.email_notifications
        };
    }

    async updateUserSettings(userId: number, updates: Partial<Omit<UserSettings, 'userId'>>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (updates.openaiApiKey !== undefined) { fields.push(`openai_api_key = $${idx++}`); values.push(updates.openaiApiKey); }
        if (updates.psiApiKey !== undefined) { fields.push(`psi_api_key = $${idx++}`); values.push(updates.psiApiKey); }
        if (updates.maxCrawlsPerDay !== undefined) { fields.push(`max_crawls_per_day = $${idx++}`); values.push(updates.maxCrawlsPerDay); }
        if (updates.emailNotifications !== undefined) { fields.push(`email_notifications = $${idx++}`); values.push(updates.emailNotifications); }

        if (fields.length === 0) return;

        values.push(userId);
        await this.pool.query(
            `UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = $${idx}`,
            values
        );
    }

    async recordUserUsage(userId: number, actionType: string, creditsUsed: number = 1): Promise<void> {
        await this.pool.query(
            'INSERT INTO user_usage (user_id, action_type, timestamp, credits_used) VALUES ($1, $2, NOW(), $3)',
            [this.safeInt(userId), actionType, this.safeInt(creditsUsed)]
        );
    }

    async getUserUsage(userId: number, actionType?: string, limit: number = 100): Promise<UserUsage[]> {
        let sql = 'SELECT * FROM user_usage WHERE user_id = $1';
        const params: any[] = [userId];

        if (actionType) {
            sql += ' AND action_type = $2';
            params.push(actionType);
        }

        sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const res = await this.pool.query(sql, params);
        return res.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            actionType: row.action_type,
            timestamp: row.timestamp,
            creditsUsed: row.credits_used
        }));
    }

    async getTodayUsageCount(userId: number, actionType: string): Promise<number> {
        const res = await this.pool.query(
            "SELECT COUNT(*) FROM user_usage WHERE user_id = $1 AND action_type = $2 AND timestamp >= CURRENT_DATE",
            [userId, actionType]
        );
        return parseInt(res.rows[0].count);
    }

    async getUserUsageStats(userId: number, since?: string): Promise<any> {
        let sql = 'SELECT action_type as type, COUNT(*) as count, SUM(credits_used) as credits FROM user_usage WHERE user_id = $1';
        const params: any[] = [userId];

        if (since) {
            sql += ' AND timestamp >= $2';
            params.push(since);
        }

        sql += ' GROUP BY action_type';

        const res = await this.pool.query(sql, params);
        return res.rows.map(row => ({
            type: row.type,
            count: parseInt(row.count),
            credits: parseInt(row.credits || 0)
        }));
    }

    private mapUser(row: any): User {
        return {
            id: row.id,
            email: row.email,
            passwordHash: row.password_hash,
            name: row.name,
            createdAt: row.created_at,
            lastLogin: row.last_login,
            isActive: row.is_active,
            role: row.role
        };
    }
}
