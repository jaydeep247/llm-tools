import { Pool } from 'pg';
import { CrawlSession, CrawlSchedule, ScheduleExecution } from '../types.js';

export class CrawlRepository {
    constructor(private pool: Pool) { }

    async createCrawlSession(data: Omit<CrawlSession, 'id'>): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO crawl_sessions 
      (start_url, allow_subdomains, max_concurrency, mode, schedule_id, user_id, started_at, completed_at, total_pages, total_resources, duration, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
            [
                data.startUrl, data.allowSubdomains, data.maxConcurrency, data.mode,
                data.scheduleId ?? null, data.userId ?? null, data.startedAt,
                data.completedAt ?? null, data.totalPages, data.totalResources,
                data.duration, data.status
            ]
        );
        return res.rows[0].id;
    }

    async updateCrawlSession(id: number, updates: Partial<CrawlSession>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        const columnMap: Record<string, string> = {
            startUrl: 'start_url',
            allowSubdomains: 'allow_subdomains',
            maxConcurrency: 'max_concurrency',
            mode: 'mode',
            scheduleId: 'schedule_id',
            startedAt: 'started_at',
            completedAt: 'completed_at',
            totalPages: 'total_pages',
            totalResources: 'total_resources',
            duration: 'duration',
            status: 'status',
        };

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'id') continue;
            const column = columnMap[key] || key;
            fields.push(`${column} = $${idx++}`);
            values.push(value);
        }

        if (fields.length === 0) return;

        values.push(id);
        await this.pool.query(
            `UPDATE crawl_sessions SET ${fields.join(', ')} WHERE id = $${idx}`,
            values
        );
    }

    async getCrawlSession(id: number): Promise<CrawlSession | null> {
        const res = await this.pool.query('SELECT * FROM crawl_sessions WHERE id = $1', [id]);
        if (res.rows.length === 0) return null;
        return this.mapSession(res.rows[0]);
    }

    async getLatestCrawlSession(): Promise<CrawlSession | null> {
        const res = await this.pool.query('SELECT * FROM crawl_sessions ORDER BY started_at DESC LIMIT 1');
        if (res.rows.length === 0) return null;
        return this.mapSession(res.rows[0]);
    }

    async getCrawlSessions(limit: number = 50, offset: number = 0, scheduleId?: number, userId?: number): Promise<CrawlSession[]> {
        let sql = 'SELECT * FROM crawl_sessions';
        const params: any[] = [];
        const conditions: string[] = [];

        if (typeof scheduleId === 'number') {
            conditions.push(`schedule_id = $${params.length + 1}`);
            params.push(scheduleId);
        }

        if (typeof userId === 'number') {
            conditions.push(`user_id = $${params.length + 1}`);
            params.push(userId);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ` ORDER BY started_at DESC LIMIT ${params.length + 1} OFFSET ${params.length + 2}`;
        params.push(limit, offset);

        const res = await this.pool.query(sql, params);
        return res.rows.map(row => this.mapSession(row));
    }

    async insertCrawlSchedule(data: Omit<CrawlSchedule, 'id'>): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO crawl_schedules 
      (name, description, start_url, allow_subdomains, max_concurrency, mode, cron_expression, enabled, user_id, created_at, last_run, next_run, total_runs, successful_runs, failed_runs)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
            [
                data.name, data.description, data.startUrl, data.allowSubdomains,
                data.maxConcurrency, data.mode, data.cronExpression, data.enabled,
                data.userId ?? null, data.createdAt, data.lastRun || null,
                data.nextRun || null, data.totalRuns, data.successfulRuns, data.failedRuns
            ]
        );
        return res.rows[0].id;
    }

    async updateCrawlSchedule(id: number, updates: Partial<CrawlSchedule>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        const columnMap: Record<string, string> = {
            startUrl: 'start_url',
            allowSubdomains: 'allow_subdomains',
            maxConcurrency: 'max_concurrency',
            cronExpression: 'cron_expression',
            userId: 'user_id',
            createdAt: 'created_at',
            lastRun: 'last_run',
            nextRun: 'next_run',
            totalRuns: 'total_runs',
            successfulRuns: 'successful_runs',
            failedRuns: 'failed_runs',
        };

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'id') continue;
            const column = columnMap[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            fields.push(`${column} = $${idx++}`);
            values.push(value);
        }

        if (fields.length === 0) return;

        values.push(id);
        await this.pool.query(
            `UPDATE crawl_schedules SET ${fields.join(', ')} WHERE id = $${idx}`,
            values
        );
    }

    async deleteCrawlSchedule(id: number): Promise<void> {
        await this.pool.query('DELETE FROM crawl_schedules WHERE id = $1', [id]);
    }

    async getCrawlSchedule(id: number): Promise<CrawlSchedule | null> {
        const res = await this.pool.query('SELECT * FROM crawl_schedules WHERE id = $1', [id]);
        if (res.rows.length === 0) return null;
        return this.mapSchedule(res.rows[0]);
    }

    async getAllCrawlSchedules(): Promise<CrawlSchedule[]> {
        const res = await this.pool.query('SELECT * FROM crawl_schedules ORDER BY created_at DESC');
        return res.rows.map(row => this.mapSchedule(row));
    }

    async getEnabledCrawlSchedules(): Promise<CrawlSchedule[]> {
        const res = await this.pool.query('SELECT * FROM crawl_schedules WHERE enabled = TRUE');
        return res.rows.map(row => this.mapSchedule(row));
    }

    async insertScheduleExecution(data: Omit<ScheduleExecution, 'id'>): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO schedule_executions 
      (schedule_id, session_id, started_at, completed_at, status, error_message, pages_crawled, resources_found, duration)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
            [
                data.scheduleId, data.sessionId, data.startedAt, data.completedAt || null,
                data.status, data.errorMessage || null, data.pagesCrawled,
                data.resourcesFound, data.duration
            ]
        );
        return res.rows[0].id;
    }

    async updateScheduleExecution(id: number, updates: Partial<ScheduleExecution>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        const columnMap: Record<string, string> = {
            scheduleId: 'schedule_id',
            sessionId: 'session_id',
            startedAt: 'started_at',
            completedAt: 'completed_at',
            errorMessage: 'error_message',
            pagesCrawled: 'pages_crawled',
            resourcesFound: 'resources_found',
        };

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'id') continue;
            const column = columnMap[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            fields.push(`${column} = $${idx++}`);
            values.push(value);
        }

        if (fields.length === 0) return;

        values.push(id);
        await this.pool.query(
            `UPDATE schedule_executions SET ${fields.join(', ')} WHERE id = $${idx}`,
            values
        );
    }

    async getScheduleExecutions(scheduleId: number, limit: number = 50): Promise<ScheduleExecution[]> {
        const res = await this.pool.query(
            'SELECT * FROM schedule_executions WHERE schedule_id = $1 ORDER BY started_at DESC LIMIT $2',
            [scheduleId, limit]
        );
        return res.rows.map(row => this.mapExecution(row));
    }

    async getAllScheduleExecutions(limit: number = 100): Promise<ScheduleExecution[]> {
        const res = await this.pool.query(
            'SELECT * FROM schedule_executions ORDER BY started_at DESC LIMIT $1',
            [limit]
        );
        return res.rows.map(row => this.mapExecution(row));
    }

    async getUserCrawlSessionsWithResults(userId: number, limit: number = 50, offset: number = 0): Promise<any[]> {
        const sql = `
            SELECT 
                cs.*,
                COALESCE((SELECT COUNT(*) FROM pages WHERE session_id = cs.id), 0) as total_pages,
                COALESCE((SELECT COUNT(*) FROM resources WHERE session_id = cs.id), 0) as total_resources,
                aar.grade,
                aar.grade_color,
                aar.overall_score,
                aar.analysis_timestamp
            FROM crawl_sessions cs
            LEFT JOIN aeo_analysis_results aar ON cs.id = aar.session_id
            WHERE cs.user_id = $1 OR cs.id IN (SELECT session_id FROM session_shares WHERE user_id = $1)
            ORDER BY cs.started_at DESC
            LIMIT $2 OFFSET $3
        `;
        const res = await this.pool.query(sql, [userId, limit, offset]);

        return res.rows.map(row => ({
            session: this.mapSession(row),
            aeoResult: row.overall_score !== null ? {
                grade: row.grade,
                gradeColor: row.grade_color,
                overallScore: row.overall_score,
                analysisTimestamp: row.analysis_timestamp
            } : null
        }));
    }

    async shareSessionWithUser(sessionId: number, userId: number): Promise<void> {
        await this.pool.query(
            'INSERT INTO session_shares (session_id, user_id, shared_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
            [sessionId, userId]
        );
    }

    async getCrawlLogs(sessionId: number): Promise<any[]> {
        const res = await this.pool.query(
            'SELECT * FROM crawl_logs WHERE session_id = $1 ORDER BY timestamp ASC',
            [sessionId]
        );
        return res.rows;
    }

    async getLatestSessionByUrl(url: string, userId: number): Promise<CrawlSession | null> {
        const res = await this.pool.query(
            'SELECT * FROM crawl_sessions WHERE start_url = $1 AND user_id = $2 ORDER BY started_at DESC LIMIT 1',
            [url, userId]
        );
        if (res.rows.length === 0) return null;
        return this.mapSession(res.rows[0]);
    }

    async getRunningSessionByUrl(url: string, userId?: number): Promise<CrawlSession | null> {
        let sql = "SELECT * FROM crawl_sessions WHERE start_url = $1 AND status = 'running'";
        const params: any[] = [url];
        if (userId) {
            sql += " AND user_id = $2";
            params.push(userId);
        }
        const res = await this.pool.query(sql, params);
        return res.rows.length > 0 ? this.mapSession(res.rows[0]) : null;
    }

    async getUserSessionsWithShares(userId: number, limit: number = 100, offset: number = 0): Promise<any[]> {
        const query = `
      SELECT cs.*
      FROM crawl_sessions cs
      LEFT JOIN session_shares ss ON cs.id = ss.session_id
      WHERE cs.user_id = $1 OR ss.user_id = $1
      GROUP BY cs.id
      ORDER BY COALESCE(cs.completed_at, cs.started_at) DESC
      LIMIT $2 OFFSET $3
    `;
        const res = await this.pool.query(query, [userId, limit, offset]);
        return res.rows.map(row => this.mapSession(row));
    }

    async getAverageDurationForUrl(url: string, userId?: number): Promise<number> {
        let sql = "SELECT AVG(duration) as avg_duration FROM crawl_sessions WHERE start_url = $1 AND status = 'completed'";
        const params: any[] = [url];
        if (userId) {
            sql += " AND user_id = $2";
            params.push(userId);
        }
        const res = await this.pool.query(sql, params);
        return parseFloat(res.rows[0].avg_duration) || 0;
    }

    async clearAllData(): Promise<void> {
        const tables = [
            'aeo_analysis_results', 'aeo_executions', 'aeo_schedules',
            'audit_results', 'audit_executions', 'audit_schedules',
            'seo_cache', 'sitemap_urls', 'sitemap_discoveries',
            'links', 'resources', 'pages',
            'crawl_logs', 'schedule_executions', 'session_shares', 'crawl_sessions'
        ];
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const table of tables) {
                await client.query(`TRUNCATE TABLE ${table} CASCADE`);
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async getScheduleExecutionsWithDetails(filters: any, limit: number = 100, offset: number = 0): Promise<any> {
        let query = `
      SELECT se.*, cs.name as schedule_name, cs.start_url, cs.mode, cs.allow_subdomains, cs.max_concurrency
      FROM schedule_executions se
      LEFT JOIN crawl_schedules cs ON se.schedule_id = cs.id
    `;
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.scheduleId) {
            conditions.push(`se.schedule_id = $${params.length + 1}`);
            params.push(filters.scheduleId);
        }
        if (filters.status) {
            conditions.push(`se.status = $${params.length + 1}`);
            params.push(filters.status);
        }
        if (filters.startDate) {
            conditions.push(`se.started_at >= $${params.length + 1}`);
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            conditions.push(`se.started_at <= $${params.length + 1}`);
            params.push(filters.endDate);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const countQuery = `SELECT COUNT(*) FROM (${query}) as sub`;
        const countRes = await this.pool.query(countQuery, params);

        query += ` ORDER BY se.started_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const res = await this.pool.query(query, params);
        return {
            executions: res.rows,
            total: parseInt(countRes.rows[0].count)
        };
    }

    async getExecutionWithSession(executionId: number): Promise<any> {
        const query = `
      SELECT se.*, cs.name as schedule_name, cs.start_url, cs.mode, cs.allow_subdomains, cs.max_concurrency
      FROM schedule_executions se
      LEFT JOIN crawl_schedules cs ON se.schedule_id = cs.id
      WHERE se.id = $1
    `;
        const res = await this.pool.query(query, [executionId]);
        if (res.rows.length === 0) return null;
        return res.rows[0];
    }

    async getScheduleStats(scheduleId?: number): Promise<any> {
        let query = `
      SELECT 
        COUNT(*) as total_executions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_executions,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_executions,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_executions,
        AVG(CASE WHEN status = 'completed' THEN duration ELSE NULL END) as avg_duration,
        SUM(pages_crawled) as total_pages_crawled,
        SUM(resources_found) as total_resources_found
      FROM schedule_executions
    `;
        const params: any[] = [];
        if (scheduleId) {
            query += ' WHERE schedule_id = $1';
            params.push(scheduleId);
        }
        const res = await this.pool.query(query, params);
        return res.rows[0];
    }

    async getRecentExecutions(limit: number = 10, scheduleId?: number): Promise<any[]> {
        let query = `
      SELECT se.*, cs.name as schedule_name
      FROM schedule_executions se
      LEFT JOIN crawl_schedules cs ON se.schedule_id = cs.id
    `;
        const params: any[] = [];
        if (scheduleId) {
            query += ' WHERE se.schedule_id = $1';
            params.push(scheduleId);
        }
        query += ` ORDER BY se.started_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);
        const res = await this.pool.query(query, params);
        return res.rows;
    }

    async getSchedulePerformance(): Promise<any[]> {
        const query = `
      SELECT 
        cs.id,
        cs.name,
        cs.start_url,
        COUNT(se.id) as total_runs,
        SUM(CASE WHEN se.status = 'completed' THEN 1 ELSE 0 END) as successful_runs,
        SUM(CASE WHEN se.status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
        AVG(CASE WHEN se.status = 'completed' THEN se.duration ELSE NULL END) as avg_duration,
        MAX(se.started_at) as last_run
      FROM crawl_schedules cs
      LEFT JOIN schedule_executions se ON cs.id = se.schedule_id
      GROUP BY cs.id, cs.name, cs.start_url
      ORDER BY last_run DESC
    `;
        const res = await this.pool.query(query);
        return res.rows;
    }

    async exportCronHistory(filters: any): Promise<any[]> {
        let query = `
      SELECT se.*, cs.name as schedule_name, cs.start_url, cs.mode, cs.allow_subdomains, cs.max_concurrency
      FROM schedule_executions se
      LEFT JOIN crawl_schedules cs ON se.schedule_id = cs.id
    `;
        const conditions: string[] = [];
        const params: any[] = [];
        if (filters.scheduleId) {
            conditions.push(`se.schedule_id = $${params.length + 1}`);
            params.push(filters.scheduleId);
        }
        if (filters.startDate) {
            conditions.push(`se.started_at >= $${params.length + 1}`);
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            conditions.push(`se.started_at <= $${params.length + 1}`);
            params.push(filters.endDate);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY se.started_at DESC';
        const res = await this.pool.query(query, params);
        return res.rows;
    }

    async logCrawlMessage(sessionId: number, message: string, level: string = 'info'): Promise<void> {
        await this.pool.query(
            'INSERT INTO crawl_logs (session_id, message, level, timestamp) VALUES ($1, $2, $3, NOW())',
            [sessionId, message, level]
        );
    }

    private mapSession(row: any): CrawlSession {
        return {
            id: row.id,
            startUrl: row.start_url,
            allowSubdomains: row.allow_subdomains,
            maxConcurrency: row.max_concurrency,
            mode: row.mode,
            scheduleId: row.schedule_id,
            userId: row.user_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            totalPages: row.total_pages,
            totalResources: row.total_resources,
            duration: row.duration,
            status: row.status
        };
    }

    private mapSchedule(row: any): CrawlSchedule {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            startUrl: row.start_url,
            allowSubdomains: row.allow_subdomains,
            maxConcurrency: row.max_concurrency,
            mode: row.mode,
            cronExpression: row.cron_expression,
            enabled: row.enabled,
            userId: row.user_id,
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs
        };
    }

    private mapExecution(row: any): ScheduleExecution {
        return {
            id: row.id,
            scheduleId: row.schedule_id,
            sessionId: row.session_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            errorMessage: row.error_message,
            pagesCrawled: row.pages_crawled,
            resourcesFound: row.resources_found,
            duration: row.duration
        };
    }
}
