import { Pool } from 'pg';
import { AuditSchedule, AuditExecution } from '../types.js';

export class AuditRepository {
    constructor(private pool: Pool) { }

    private safeInt(val: any): number | null {
        if (val === undefined || val === null) return null;
        if (typeof val === 'number') return Math.round(val);
        const parsed = parseFloat(val);
        return isNaN(parsed) ? null : Math.round(parsed);
    }

    async insertAuditSchedule(schedule: Omit<AuditSchedule, 'id'>): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO audit_schedules 
      (name, description, urls, device, cron_expression, enabled, user_id, created_at, last_run, next_run, total_runs, successful_runs, failed_runs)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
            [
                schedule.name, schedule.description, schedule.urls, schedule.device,
                schedule.cronExpression, schedule.enabled, schedule.userId || null,
                schedule.createdAt, schedule.lastRun || null, schedule.nextRun || null,
                schedule.totalRuns, schedule.successfulRuns, schedule.failedRuns
            ]
        );
        return res.rows[0].id;
    }

    async updateAuditSchedule(id: number, updates: Partial<AuditSchedule>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        const columnMap: Record<string, string> = {
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
            const column = columnMap[key] || key;
            fields.push(`${column} = $${idx++}`);
            values.push(value);
        }

        if (fields.length === 0) return;

        values.push(id);
        await this.pool.query(
            `UPDATE audit_schedules SET ${fields.join(', ')} WHERE id = $${idx}`,
            values
        );
    }

    async deleteAuditSchedule(id: number): Promise<void> {
        await this.pool.query('DELETE FROM audit_schedules WHERE id = $1', [id]);
    }

    async getAuditSchedule(id: number): Promise<AuditSchedule | null> {
        const res = await this.pool.query('SELECT * FROM audit_schedules WHERE id = $1', [id]);
        if (res.rows.length === 0) return null;
        return this.mapAuditSchedule(res.rows[0]);
    }

    async getAllAuditSchedules(limit: number = 100): Promise<AuditSchedule[]> {
        const res = await this.pool.query('SELECT * FROM audit_schedules ORDER BY created_at DESC LIMIT $1', [limit]);
        return res.rows.map(row => this.mapAuditSchedule(row));
    }

    async getEnabledAuditSchedules(): Promise<AuditSchedule[]> {
        const res = await this.pool.query('SELECT * FROM audit_schedules WHERE enabled = TRUE');
        return res.rows.map(row => this.mapAuditSchedule(row));
    }

    async insertAuditExecution(execution: Omit<AuditExecution, 'id'>): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO audit_executions 
      (schedule_id, started_at, completed_at, status, error_message, urls_processed, urls_successful, urls_failed, duration)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
            [
                execution.scheduleId, execution.startedAt, execution.completedAt || null,
                execution.status, execution.errorMessage || null, execution.urlsProcessed,
                execution.urlsSuccessful, execution.urlsFailed, execution.duration
            ]
        );
        return res.rows[0].id;
    }

    async updateAuditExecution(id: number, updates: Partial<AuditExecution>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        const columnMap: Record<string, string> = {
            scheduleId: 'schedule_id',
            startedAt: 'started_at',
            completedAt: 'completed_at',
            urlsProcessed: 'urls_processed',
            urlsSuccessful: 'urls_successful',
            urlsFailed: 'urls_failed',
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
            `UPDATE audit_executions SET ${fields.join(', ')} WHERE id = $${idx}`,
            values
        );
    }

    async getAuditExecutions(scheduleId: number, limit: number = 50): Promise<AuditExecution[]> {
        const res = await this.pool.query(
            'SELECT * FROM audit_executions WHERE schedule_id = $1 ORDER BY started_at DESC LIMIT $2',
            [scheduleId, limit]
        );
        return res.rows.map(row => this.mapAuditExecution(row));
    }

    async getAllAuditExecutions(limit: number = 100): Promise<AuditExecution[]> {
        const res = await this.pool.query(
            'SELECT * FROM audit_executions ORDER BY started_at DESC LIMIT $1',
            [limit]
        );
        return res.rows.map(row => this.mapAuditExecution(row));
    }

    async getAuditResultsByUrl(url: string, device: string, limit: number = 5): Promise<any[]> {
        const sql = 'SELECT * FROM audit_results WHERE url = $1 AND device = $2 ORDER BY timestamp DESC LIMIT $3';
        const res = await this.pool.query(sql, [url, device, limit]);
        return res.rows.map(row => ({
            ...row,
            fullReport: row.full_report ? JSON.parse(row.full_report) : undefined
        }));
    }

    async insertAuditResult(data: any): Promise<number> {
        const sql = `
      INSERT INTO audit_results (
        url, device, run_at, 
        lcp_ms, tbt_ms, cls, fcp_ms, ttfb_ms,
        performance_score, psi_report_url, 
        metrics_json, raw_json, session_id,
        status, progress
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `;
        const res = await this.pool.query(sql, [
            data.url, data.device, data.run_at || new Date().toISOString(),
            this.safeInt(data.lcp_ms), this.safeInt(data.tbt_ms), data.cls,
            this.safeInt(data.fcp_ms), this.safeInt(data.ttfb_ms),
            this.safeInt(data.performance_score), data.psi_report_url,
            data.metrics_json ? JSON.stringify(data.metrics_json) : null,
            data.raw_json ? JSON.stringify(data.raw_json) : null,
            this.safeInt(data.session_id),
            data.status || 'completed',
            this.safeInt(data.progress) || 100
        ]);
        return res.rows[0].id;
    }

    async updateAuditResult(id: number, updates: any): Promise<void> {
        const sets: string[] = [];
        const params: any[] = [id];
        let i = 2;

        const fieldMap: Record<string, string> = {
            lcp_ms: 'lcp_ms',
            tbt_ms: 'tbt_ms',
            cls: 'cls',
            fcp_ms: 'fcp_ms',
            ttfb_ms: 'ttfb_ms',
            performance_score: 'performance_score',
            psi_report_url: 'psi_report_url',
            status: 'status',
            progress: 'progress',
            metrics_json: 'metrics_json',
            raw_json: 'raw_json'
        };

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (updates[key] !== undefined) {
                sets.push(`${dbField} = $${i++}`);
                let val = updates[key];
                if (key.endsWith('_json')) {
                    val = JSON.stringify(val);
                } else if (['lcp_ms', 'tbt_ms', 'fcp_ms', 'ttfb_ms', 'performance_score', 'progress', 'session_id'].includes(key)) {
                    val = this.safeInt(val);
                }
                params.push(val);
            }
        }

        if (sets.length === 0) return;

        const sql = `UPDATE audit_results SET ${sets.join(', ')} WHERE id = $1`;
        await this.pool.query(sql, params);
    }

    async getAuditResult(url: string, device: string): Promise<any | null> {
        const sql = 'SELECT * FROM audit_results WHERE url = $1 AND device = $2 ORDER BY run_at DESC LIMIT 1';
        const res = await this.pool.query(sql, [url, device]);
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        return {
            ...row,
            metrics_json: row.metrics_json ? JSON.parse(row.metrics_json) : undefined,
            raw_json: row.raw_json ? JSON.parse(row.raw_json) : undefined
        };
    }

    async getAuditResultById(id: number): Promise<any | null> {
        const res = await this.pool.query('SELECT * FROM audit_results WHERE id = $1', [id]);
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        return {
            ...row,
            metrics_json: row.metrics_json ? JSON.parse(row.metrics_json) : undefined,
            raw_json: row.raw_json ? JSON.parse(row.raw_json) : undefined
        };
    }

    async getAuditResults(device?: string, limit: number = 100): Promise<any[]> {
        let sql = 'SELECT * FROM audit_results';
        const params: any[] = [];
        if (device && device !== 'all' && device !== undefined) {
            sql += ' WHERE device = $1';
            params.push(device);
        }
        sql += ' ORDER BY run_at DESC LIMIT $' + (params.length + 1);
        params.push(limit);
        const res = await this.pool.query(sql, params);
        return res.rows;
    }

    async getAuditResultsBySessionId(sessionId: number, device?: string, limit: number = 200): Promise<any[]> {
        let sql = 'SELECT * FROM audit_results WHERE session_id = $1';
        const params: any[] = [sessionId];
        if (device && device !== 'all' && device !== undefined) {
            sql += ' AND device = $2';
            params.push(device);
        }
        sql += ' ORDER BY run_at DESC LIMIT $' + (params.length + 1);
        params.push(limit);
        const res = await this.pool.query(sql, params);
        return res.rows;
    }

    async hasAuditsForSession(sessionId: number): Promise<boolean> {
        const res = await this.pool.query(
            'SELECT EXISTS(SELECT 1 FROM audit_results WHERE session_id = $1) as has_audits',
            [sessionId]
        );
        return res.rows[0].has_audits;
    }

    async getAuditProgressBySession(sessionId: number): Promise<{ total: number; completed: number; }> {
        // Only count pages that were successfully crawled (status 200) as they are the only ones audited
        const totalSql = 'SELECT COUNT(*) FROM pages WHERE session_id = $1 AND status_code = 200';
        const completedSql = 'SELECT COUNT(*) FROM audit_results WHERE session_id = $1';

        const [totalRes, completedRes] = await Promise.all([
            this.pool.query(totalSql, [sessionId]),
            this.pool.query(completedSql, [sessionId])
        ]);

        return {
            total: parseInt(totalRes.rows[0].count),
            completed: parseInt(completedRes.rows[0].count)
        };
    }

    async insertAEOAnalysisResult(data: any): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO aeo_analysis_results 
      (session_id, url, user_id, grade, grade_color, overall_score, module_scores, module_weights, detailed_analysis, structured_data, recommendations, errors, warnings, analysis_timestamp, run_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
            [
                data.sessionId, data.url, data.userId, data.grade, data.gradeColor,
                data.overallScore, JSON.stringify(data.moduleScores), JSON.stringify(data.moduleWeights),
                JSON.stringify(data.detailedAnalysis), JSON.stringify(data.structuredData),
                JSON.stringify(data.recommendations), JSON.stringify(data.errors),
                JSON.stringify(data.warnings), data.analysisTimestamp, data.runId
            ]
        );
        return res.rows[0].id;
    }

    async saveAeoAnalysisResult(data: any): Promise<number> {
        return this.insertAEOAnalysisResult(data);
    }

    async getAeoAnalysisResultBySessionId(sessionId: number): Promise<any | null> {
        const res = await this.pool.query(
            'SELECT * FROM aeo_analysis_results WHERE session_id = $1 ORDER BY analysis_timestamp DESC LIMIT 1',
            [sessionId]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        // Parse JSON fields
        return {
            ...row,
            sessionId: row.session_id,
            userId: row.user_id,
            gradeColor: row.grade_color,
            overallScore: row.overall_score,
            moduleScores: typeof row.module_scores === 'string' ? JSON.parse(row.module_scores) : row.module_scores,
            moduleWeights: typeof row.module_weights === 'string' ? JSON.parse(row.module_weights) : row.module_weights,
            detailedAnalysis: typeof row.detailed_analysis === 'string' ? JSON.parse(row.detailed_analysis) : row.detailed_analysis,
            structuredData: typeof row.structured_data === 'string' ? JSON.parse(row.structured_data) : row.structured_data,
            recommendations: typeof row.recommendations === 'string' ? JSON.parse(row.recommendations) : row.recommendations,
            errors: typeof row.errors === 'string' ? JSON.parse(row.errors) : row.errors,
            warnings: typeof row.warnings === 'string' ? JSON.parse(row.warnings) : row.warnings,
            analysisTimestamp: row.analysis_timestamp,
            runId: row.run_id
        };
    }

    private mapAuditExecution(row: any): AuditExecution {
        return {
            id: row.id,
            scheduleId: row.schedule_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            errorMessage: row.error_message,
            urlsProcessed: row.urls_processed,
            urlsSuccessful: row.urls_successful,
            urlsFailed: row.urls_failed,
            duration: row.duration
        };
    }

    private mapAuditSchedule(row: any): AuditSchedule {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            urls: row.urls,
            device: row.device,
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
}
