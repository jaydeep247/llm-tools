import { prisma } from '../../config/prismaClient.js';
import { AuditSchedule, AuditExecution } from '../types.js';

export class AuditRepository {
    constructor() { }

    private safeInt(val: any): number | null {
        if (val === undefined || val === null) return null;
        if (typeof val === 'number') return Math.round(val);
        const parsed = parseFloat(val);
        return isNaN(parsed) ? null : Math.round(parsed);
    }

    async insertAuditSchedule(schedule: Omit<AuditSchedule, 'id'>): Promise<number> {
        const result = await prisma.auditSchedule.create({
            data: {
                name: schedule.name,
                description: schedule.description,
                urls: schedule.urls,
                device: schedule.device,
                cronExpression: schedule.cronExpression,
                enabled: schedule.enabled,
                userId: schedule.userId ?? null,
                createdAt: schedule.createdAt,
                lastRun: schedule.lastRun || null,
                nextRun: schedule.nextRun || null,
                totalRuns: schedule.totalRuns,
                successfulRuns: schedule.successfulRuns,
                failedRuns: schedule.failedRuns,
            },
        });
        return result.id;
    }

    async updateAuditSchedule(id: number, updates: Partial<AuditSchedule>): Promise<void> {
        const updateData: any = {};

        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.description !== undefined) updateData.description = updates.description;
        if (updates.urls !== undefined) updateData.urls = updates.urls;
        if (updates.device !== undefined) updateData.device = updates.device;
        if (updates.cronExpression !== undefined) updateData.cronExpression = updates.cronExpression;
        if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
        if (updates.userId !== undefined) updateData.userId = updates.userId;
        if (updates.createdAt !== undefined) updateData.createdAt = updates.createdAt;
        if (updates.lastRun !== undefined) updateData.lastRun = updates.lastRun;
        if (updates.nextRun !== undefined) updateData.nextRun = updates.nextRun;
        if (updates.totalRuns !== undefined) updateData.totalRuns = updates.totalRuns;
        if (updates.successfulRuns !== undefined) updateData.successfulRuns = updates.successfulRuns;
        if (updates.failedRuns !== undefined) updateData.failedRuns = updates.failedRuns;

        if (Object.keys(updateData).length === 0) return;

        await prisma.auditSchedule.update({
            where: { id },
            data: updateData,
        });
    }

    async deleteAuditSchedule(id: number): Promise<void> {
        await prisma.auditSchedule.delete({
            where: { id },
        });
    }

    async getAuditSchedule(id: number): Promise<AuditSchedule | null> {
        const schedule = await prisma.auditSchedule.findUnique({
            where: { id },
        });
        if (!schedule) return null;
        return this.mapAuditSchedule(schedule);
    }

    async getAllAuditSchedules(limit: number = 100): Promise<AuditSchedule[]> {
        const schedules = await prisma.auditSchedule.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return schedules.map((schedule: any) => this.mapAuditSchedule(schedule));
    }

    async getEnabledAuditSchedules(): Promise<AuditSchedule[]> {
        const schedules = await prisma.auditSchedule.findMany({
            where: { enabled: true },
        });
        return schedules.map((schedule: any) => this.mapAuditSchedule(schedule));
    }

    async insertAuditExecution(execution: Omit<AuditExecution, 'id'>): Promise<number> {
        const result = await prisma.auditExecution.create({
            data: {
                scheduleId: execution.scheduleId,
                startedAt: execution.startedAt,
                completedAt: execution.completedAt || null,
                status: execution.status,
                errorMessage: execution.errorMessage || null,
                urlsProcessed: execution.urlsProcessed,
                urlsSuccessful: execution.urlsSuccessful,
                urlsFailed: execution.urlsFailed,
                duration: execution.duration,
            },
        });
        return result.id;
    }

    async updateAuditExecution(id: number, updates: Partial<AuditExecution>): Promise<void> {
        const updateData: any = {};

        if (updates.scheduleId !== undefined) updateData.scheduleId = updates.scheduleId;
        if (updates.startedAt !== undefined) updateData.startedAt = updates.startedAt;
        if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt;
        if (updates.status !== undefined) updateData.status = updates.status;
        if (updates.errorMessage !== undefined) updateData.errorMessage = updates.errorMessage;
        if (updates.urlsProcessed !== undefined) updateData.urlsProcessed = updates.urlsProcessed;
        if (updates.urlsSuccessful !== undefined) updateData.urlsSuccessful = updates.urlsSuccessful;
        if (updates.urlsFailed !== undefined) updateData.urlsFailed = updates.urlsFailed;
        if (updates.duration !== undefined) updateData.duration = updates.duration;

        if (Object.keys(updateData).length === 0) return;

        await prisma.auditExecution.update({
            where: { id },
            data: updateData,
        });
    }

    async getAuditExecutions(scheduleId: number, limit: number = 50): Promise<AuditExecution[]> {
        const executions = await prisma.auditExecution.findMany({
            where: { scheduleId },
            orderBy: { startedAt: 'desc' },
            take: limit,
        });
        return executions.map((execution: any) => this.mapAuditExecution(execution));
    }

    async getAllAuditExecutions(limit: number = 100): Promise<AuditExecution[]> {
        const executions = await prisma.auditExecution.findMany({
            orderBy: { startedAt: 'desc' },
            take: limit,
        });
        return executions.map((execution: any) => this.mapAuditExecution(execution));
    }

    async getAuditResultsByUrl(url: string, device: string, limit: number = 5): Promise<any[]> {
        const results = await prisma.auditResult.findMany({
            where: {
                url,
                device,
            },
            orderBy: { runAt: 'desc' },
            take: limit,
        });

        return results.map((result: any) => ({
            ...result,
            fullReport: undefined, // This field doesn't exist in schema
        }));
    }

    async insertAuditResult(data: any): Promise<number> {
        const result = await prisma.auditResult.create({
            data: {
                url: data.url,
                device: data.device,
                runAt: data.run_at ? new Date(data.run_at) : new Date(),
                lcpMs: data.lcp_ms ?? null,
                tbtMs: data.tbt_ms ?? null,
                cls: data.cls ?? null,
                fcpMs: data.fcp_ms ?? null,
                ttfbMs: data.ttfb_ms ?? null,
                fcp: data.fcp ?? null,
                ttfb: data.ttfb ?? null,
                fid: data.fid ?? null,
                deviceType: data.device_type ?? data.device ?? 'desktop',
                performanceScore: data.performance_score ?? null,
                psiReportUrl: data.psi_report_url ?? null,
                metricsJson: data.metrics_json ? JSON.stringify(data.metrics_json) : null,
                rawJson: data.raw_json ? JSON.stringify(data.raw_json) : null,
                sessionId: data.session_id ?? null,
                status: data.status || 'completed',
                progress: data.progress || 100,
            },
        });
        return result.id;
    }

    async updateAuditResult(id: number, updates: any): Promise<void> {
        const updateData: any = {};

        if (updates.lcp_ms !== undefined) updateData.lcpMs = updates.lcp_ms;
        if (updates.tbt_ms !== undefined) updateData.tbtMs = updates.tbt_ms;
        if (updates.cls !== undefined) updateData.cls = updates.cls;
        if (updates.fcp_ms !== undefined) updateData.fcpMs = updates.fcp_ms;
        if (updates.ttfb_ms !== undefined) updateData.ttfbMs = updates.ttfb_ms;
        if (updates.fcp !== undefined) updateData.fcp = updates.fcp;
        if (updates.ttfb !== undefined) updateData.ttfb = updates.ttfb;
        if (updates.fid !== undefined) updateData.fid = updates.fid;
        if (updates.device_type !== undefined || updates.deviceType !== undefined) {
            updateData.deviceType = updates.device_type ?? updates.deviceType;
        }
        if (updates.performance_score !== undefined) updateData.performanceScore = updates.performance_score;
        if (updates.psi_report_url !== undefined) updateData.psiReportUrl = updates.psi_report_url;
        if (updates.status !== undefined) updateData.status = updates.status;
        if (updates.progress !== undefined) updateData.progress = updates.progress;
        if (updates.metrics_json !== undefined) {
            updateData.metricsJson = typeof updates.metrics_json === 'string'
                ? updates.metrics_json
                : JSON.stringify(updates.metrics_json);
        }
        if (updates.raw_json !== undefined) {
            updateData.rawJson = typeof updates.raw_json === 'string'
                ? updates.raw_json
                : JSON.stringify(updates.raw_json);
        }

        if (Object.keys(updateData).length === 0) return;

        await prisma.auditResult.update({
            where: { id },
            data: updateData,
        });
    }

    async getAuditResult(url: string, device: string): Promise<any | null> {
        const result = await prisma.auditResult.findFirst({
            where: {
                url,
                device,
            },
            orderBy: { runAt: 'desc' },
        });

        if (!result) return null;

        return {
            ...result,
            metrics_json: result.metricsJson ? JSON.parse(result.metricsJson) : undefined,
            raw_json: result.rawJson ? JSON.parse(result.rawJson) : undefined,
        };
    }

    async getAuditResultById(id: number): Promise<any | null> {
        const result = await prisma.auditResult.findUnique({
            where: { id },
        });

        if (!result) return null;

        return {
            ...result,
            metrics_json: result.metricsJson ? JSON.parse(result.metricsJson) : undefined,
            raw_json: result.rawJson ? JSON.parse(result.rawJson) : undefined,
        };
    }

    async getAuditResults(device?: string, limit: number = 100): Promise<any[]> {
        const where: any = {};
        if (device && device !== 'all' && device !== undefined) {
            where.device = device;
        }

        const results = await prisma.auditResult.findMany({
            where,
            orderBy: { runAt: 'desc' },
            take: limit,
        });

        return results;
    }

    async getAuditResultsBySessionId(sessionId: number, device?: string, limit: number = 200): Promise<any[]> {
        const where: any = { sessionId };
        if (device && device !== 'all' && device !== undefined) {
            where.device = device;
        }

        const results = await prisma.auditResult.findMany({
            where,
            orderBy: { runAt: 'desc' },
            take: limit,
        });

        return results;
    }

    async hasAuditsForSession(sessionId: number): Promise<boolean> {
        const count = await prisma.auditResult.count({
            where: { sessionId },
        });
        return count > 0;
    }

    async getAuditProgressBySession(sessionId: number): Promise<{ total: number; completed: number; }> {
        const [total, completed] = await Promise.all([
            prisma.page.count({
                where: {
                    sessionId,
                    statusCode: 200,
                },
            }),
            prisma.auditResult.count({
                where: { sessionId },
            }),
        ]);

        return {
            total,
            completed,
        };
    }

    async insertAEOAnalysisResult(data: any): Promise<number> {
        const result = await prisma.aeoAnalysisResult.create({
            data: {
                sessionId: data.sessionId ?? null,
                url: data.url,
                userId: data.userId ?? null,
                grade: data.grade ?? null,
                gradeColor: data.gradeColor ?? null,
                overallScore: data.overallScore ?? null,
                moduleScores: data.moduleScores ? JSON.stringify(data.moduleScores) : null,
                moduleWeights: data.moduleWeights ? JSON.stringify(data.moduleWeights) : null,
                detailedAnalysis: data.detailedAnalysis ? JSON.stringify(data.detailedAnalysis) : null,
                structuredData: data.structuredData ? JSON.stringify(data.structuredData) : null,
                recommendations: data.recommendations ? JSON.stringify(data.recommendations) : null,
                errors: data.errors ? JSON.stringify(data.errors) : null,
                warnings: data.warnings ? JSON.stringify(data.warnings) : null,
                analysisTimestamp: data.analysisTimestamp ? new Date(data.analysisTimestamp) : new Date(),
                runId: data.runId ?? null,
            },
        });
        return result.id;
    }

    async getAeoResultsTableBySessionId(sessionId: number): Promise<any | null> {
        const result = await prisma.aeoResult.findUnique({
            where: { sessionId },
        });

        if (!result) return null;

        const r = result as any;
        const mapped = {
            ...result,
            openai: result.scoreOpenai,
            claude: result.scoreClaude,
            gemini: result.scoreGemini,
            consistency: result.consistency,
            brand_metrics: result.brandMetrics,
            response_accuracy: r.responseAccuracy,
            citation_metrics: r.citationMetrics,
            ranking_metrics: r.rankingMetrics,
            visibility_metrics: r.visibilityMetrics,
            share_of_voice: r.shareOfVoice,
            model_wise_performance: {
                chatgpt: result.scoreOpenai,
                claude: result.scoreClaude,
                gemini: result.scoreGemini,
            },
            entity_coverage: {
                score: result.scoreEntityCoverage,
                entities_expected: result.entitiesExpected,
                entities_observed: result.entitiesObserved,
                entities_missing: result.entitiesMissing,
            },
        };

        // logger.debug(`[AuditRepository] Mapped AeoResult for sessionId=${sessionId}`, {
        //     hasCitation: !!mapped.citation_metrics,
        //     hasRanking: !!mapped.ranking_metrics
        // });

        return mapped;
    }

    async insertAeoResultsTable(data: any): Promise<number> {
        // Build update object with only provided fields to avoid overwriting existing data with undefined
        const updateData: any = { updatedAt: new Date() };
        if (data.url !== undefined) updateData.url = data.url;
        if (data.consistency !== undefined) updateData.consistency = data.consistency;
        if (data.score_entity_coverage !== undefined) updateData.scoreEntityCoverage = data.score_entity_coverage;
        if (data.entities_expected !== undefined) updateData.entitiesExpected = data.entities_expected as any;
        if (data.entities_observed !== undefined) updateData.entitiesObserved = data.entities_observed as any;
        if (data.entities_missing !== undefined) updateData.entitiesMissing = data.entities_missing as any;
        if (data.brand_metrics !== undefined) updateData.brandMetrics = data.brand_metrics as any;
        if (data.response_accuracy !== undefined) updateData.responseAccuracy = data.response_accuracy as any;
        if (data.citation_metrics !== undefined) updateData.citationMetrics = data.citation_metrics as any;
        if (data.sentiment_metrics !== undefined) updateData.sentimentMetrics = data.sentiment_metrics as any;
        if (data.visibility_metrics !== undefined) updateData.visibilityMetrics = data.visibility_metrics as any;
        if (data.share_of_voice !== undefined) updateData.shareOfVoice = data.share_of_voice as any;
        if (data.ranking_metrics !== undefined) updateData.rankingMetrics = data.ranking_metrics as any;

        const createData: any = {
            sessionId: data.session_id,
            url: data.url || '',
            consistency: data.consistency || 0,
            scoreEntityCoverage: data.score_entity_coverage || 0,
            entitiesExpected: (data.entities_expected || []) as any,
            entitiesObserved: (data.entities_observed || []) as any,
            entitiesMissing: (data.entities_missing || []) as any,
            brandMetrics: data.brand_metrics as any,
            responseAccuracy: data.response_accuracy as any,
            citationMetrics: data.citation_metrics as any,
            sentimentMetrics: data.sentiment_metrics as any,
            visibilityMetrics: data.visibility_metrics as any,
            shareOfVoice: data.share_of_voice as any,
            rankingMetrics: data.ranking_metrics as any,
        };

        const existing = await prisma.aeoResult.findUnique({
            where: { sessionId: data.session_id }
        });

        if (existing) {
            const result = await prisma.aeoResult.update({
                where: { id: existing.id },
                data: updateData,
            });
            return result.id;
        } else {
            // Include sessionId in createData for standard scalar assignment
            // or use relation connect if needed. Scholar field usually works.
            const result = await prisma.aeoResult.create({
                data: createData,
            });
            return result.id;
        }
    }

    async saveAeoAnalysisResult(data: any): Promise<number> {
        return this.insertAEOAnalysisResult(data);
    }

    async updateCitationMetricsForSession(sessionId: number, citationMetrics: any): Promise<boolean> {
        const existing = await prisma.aeoResult.findUnique({ where: { sessionId } });

        // If it doesn't exist, we create a skeleton record first
        if (!existing) {
            await this.insertAeoResultsTable({
                session_id: sessionId,
                url: citationMetrics.url || 'pending-ranking',
                ranking_metrics: citationMetrics.ranking_metrics || citationMetrics
            });
            return true;
        }

        const updateData: any = {
            updatedAt: new Date()
        };

        // Extract ranking data correctly
        if (citationMetrics.ranking_position_per_prompt) {
            updateData.rankingMetrics = {
                ranking_position_per_prompt: citationMetrics.ranking_position_per_prompt,
                url: citationMetrics.url
            };
        } else if (citationMetrics.ranking_metrics) {
            updateData.rankingMetrics = citationMetrics.ranking_metrics;
        } else {
            updateData.rankingMetrics = citationMetrics;
        }

        // Also update citationMetrics field if provided specifically
        if (citationMetrics.citation_metrics) {
            updateData.citationMetrics = citationMetrics.citation_metrics;
        }
        if (citationMetrics.visibility_metrics) {
            updateData.visibilityMetrics = citationMetrics.visibility_metrics;
        }
        if (citationMetrics.share_of_voice) {
            updateData.shareOfVoice = citationMetrics.share_of_voice;
        }

        try {
            const res = await prisma.aeoResult.update({
                where: { sessionId },
                data: updateData,
            });
            return true;
        } catch (err: any) {
            // Some deployments may have an out-of-date generated Prisma client
            // that doesn't expose `rankingMetrics` as a typed field. In that
            // case, fall back to a raw SQL update using the mapped column names.
            const msg = err && err.message ? String(err.message) : '';
            if (msg.includes('Unknown argument `rankingMetrics`') || msg.includes('rankingMetrics')) {
                // Build raw update parts for JSON columns we may have
                const parts: string[] = [];
                const params: any[] = [];
                const pushJson = (colName: string, value: any) => {
                    if (value === undefined) return;
                    if (value === null) {
                        parts.push(`${colName} = NULL`);
                    } else {
                        params.push(JSON.stringify(value));
                        parts.push(`${colName} = $${params.length}`);
                    }
                };

                // mapped column names from schema
                pushJson('ranking_metrics', updateData.rankingMetrics ?? null);
                pushJson('citation_metrics', updateData.citationMetrics ?? null);
                pushJson('visibility_metrics', updateData.visibilityMetrics ?? null);
                pushJson('share_of_voice', updateData.shareOfVoice ?? null);

                // always update updated_at
                params.push(new Date());
                parts.push(`updated_at = $${params.length}`);

                if (parts.length === 0) return true;

                const setClause = parts.join(', ');
                const sql = `UPDATE aeo_results SET ${setClause} WHERE session_id = $${params.length + 1}`;
                params.push(sessionId);

                try {
                    await prisma.$executeRawUnsafe(sql, ...params);
                    return true;
                } catch (rawErr) {
                    // rethrow original error for visibility if raw fallback fails
                    throw err;
                }
            }

            throw err;
        }

        // console.log(`[AuditRepository] updateCitationMetricsForSession res:`, {
        //     sessionId,
        //     hasRankingMetrics: !!res.rankingMetrics,
        //     hasCitationMetrics: !!res.citationMetrics
        // });

        return true;
    }

    async getAeoAnalysisResultBySessionId(sessionId: number): Promise<any | null> {
        const result = await prisma.aeoAnalysisResult.findFirst({
            where: { sessionId },
            orderBy: { analysisTimestamp: 'desc' },
        });

        if (!result) return null;

        return {
            ...result,
            sessionId: result.sessionId,
            userId: result.userId,
            gradeColor: result.gradeColor,
            overallScore: result.overallScore,
            moduleScores: result.moduleScores ? JSON.parse(result.moduleScores) : undefined,
            moduleWeights: result.moduleWeights ? JSON.parse(result.moduleWeights) : undefined,
            detailedAnalysis: result.detailedAnalysis ? JSON.parse(result.detailedAnalysis) : undefined,
            structuredData: result.structuredData ? JSON.parse(result.structuredData) : undefined,
            recommendations: result.recommendations ? JSON.parse(result.recommendations) : undefined,
            errors: result.errors ? JSON.parse(result.errors) : undefined,
            warnings: result.warnings ? JSON.parse(result.warnings) : undefined,
            analysisTimestamp: result.analysisTimestamp,
            runId: result.runId,
        };
    }

    private mapAuditExecution(execution: any): AuditExecution {
        return {
            id: execution.id,
            scheduleId: execution.scheduleId,
            startedAt: execution.startedAt instanceof Date ? execution.startedAt.toISOString() : execution.startedAt,
            completedAt: execution.completedAt ? (execution.completedAt instanceof Date ? execution.completedAt.toISOString() : execution.completedAt) : undefined,
            status: execution.status,
            errorMessage: execution.errorMessage,
            urlsProcessed: execution.urlsProcessed,
            urlsSuccessful: execution.urlsSuccessful,
            urlsFailed: execution.urlsFailed,
            duration: execution.duration,
        };
    }

    private mapAuditSchedule(schedule: any): AuditSchedule {
        return {
            id: schedule.id,
            name: schedule.name,
            description: schedule.description,
            urls: schedule.urls,
            device: schedule.device,
            cronExpression: schedule.cronExpression,
            enabled: schedule.enabled,
            userId: schedule.userId,
            createdAt: schedule.createdAt instanceof Date ? schedule.createdAt.toISOString() : schedule.createdAt,
            lastRun: schedule.lastRun ? (schedule.lastRun instanceof Date ? schedule.lastRun.toISOString() : schedule.lastRun) : undefined,
            nextRun: schedule.nextRun ? (schedule.nextRun instanceof Date ? schedule.nextRun.toISOString() : schedule.nextRun) : undefined,
            totalRuns: schedule.totalRuns,
            successfulRuns: schedule.successfulRuns,
            failedRuns: schedule.failedRuns,
        };
    }
}
