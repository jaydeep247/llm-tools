import fs from 'fs';
import path from 'path';
import { getDatabase } from '../../DatabaseService.js';

export type AuditSummary = {
    id: string;
    url: string;
    device: 'mobile' | 'desktop';
    runAt: string;
    LCP_ms?: number;
    TBT_ms?: number;
    CLS?: number;
    FCP_ms?: number;
    TTFB_ms?: number;
    performanceScore?: number;
    psiReportUrl?: string;
};

const BASE_DIR = path.resolve(process.cwd(), 'storage', 'audits');

export async function listRecent(
    device: 'mobile' | 'desktop' | 'all' = 'all',
    limit = 100,
    sessionId?: number,
    userId?: number
): Promise<AuditSummary[]> {
    const db = getDatabase();

    let results: any[];

    if (sessionId != null) {
        // Session-scoped: caller must have already verified the session belongs to the user
        results = await db.getAuditResultsBySessionId(sessionId, device, limit);
    } else if (userId != null) {
        // User-scoped: only audits for this user's crawl sessions
        results = await db.getAuditResultsForUser(userId, device, limit);
    } else {
        results = [];
    }

    return results.map((row) => {
        const runAt = row.runAt ?? row.run_at;
        const runAtStr = runAt == null ? '' : runAt instanceof Date ? runAt.toISOString() : String(runAt);
        return {
            id: `${row.id}`,
            url: row.url,
            device: row.device,
            runAt: runAtStr,
            LCP_ms: row.lcpMs ?? row.lcp_ms,
            TBT_ms: row.tbtMs ?? row.tbt_ms,
            CLS: row.cls,
            FCP_ms: row.fcpMs ?? row.fcp_ms,
            TTFB_ms: row.ttfbMs ?? row.ttfb_ms,
            performanceScore: row.performanceScore ?? row.performance_score,
            psiReportUrl: row.psiReportUrl ?? row.psi_report_url
        };
    });
}

export async function getById(id: string): Promise<any | null> {
    const db = getDatabase();
    const numId = parseInt(id, 10);

    if (!isNaN(numId)) {
        const result = await db.getAuditResultById(numId);
        if (result) {
            const runAt = result.runAt ?? result.run_at;
            const runAtStr = runAt == null ? '' : runAt instanceof Date ? runAt.toISOString() : String(runAt);
            return {
                url: result.url,
                device: result.device,
                runAt: runAtStr,
                metrics: result.metrics_json ?? result.metricsJson ?? {},
                raw: result.raw_json ?? result.rawJson ?? null
            };
        }
    }

    // Fallback: check legacy file storage for old audits
    const full = path.join(BASE_DIR, id);
    if (fs.existsSync(full)) {
        try {
            return JSON.parse(fs.readFileSync(full, 'utf-8'));
        } catch {
            return null;
        }
    }

    return null;
}


