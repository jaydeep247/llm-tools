import { ObjectId, Collection } from 'mongodb';
import { connectToMongo, getMongoDb } from '../../config/mongo';
import { JobService } from '../job/job.service';
import { logger } from '../../shared/logger/logger';
import type {
  AlertResponse,
  AlertsListResponse,
  AlertType,
  AlertSeverity,
} from './alerts.types';

// ─── helpers ────────────────────────────────────────────────────────────────

function daysUnresolved(triggeredAt: string): number {
  const ms = Date.now() - new Date(triggeredAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function isActivelySnoozed(snoozeUntil: string | null): boolean {
  if (!snoozeUntil) return false;
  return new Date(snoozeUntil) > new Date();
}

function toResponse(doc: any): AlertResponse {
  const triggeredAt = doc.triggered_at instanceof Date
    ? doc.triggered_at.toISOString()
    : String(doc.triggered_at);
  const resolvedAt = doc.resolved_at
    ? (doc.resolved_at instanceof Date ? doc.resolved_at.toISOString() : String(doc.resolved_at))
    : null;
  const snoozeUntil = doc.snoozed_until
    ? (doc.snoozed_until instanceof Date ? doc.snoozed_until.toISOString() : String(doc.snoozed_until))
    : null;
  const snoozed = isActivelySnoozed(snoozeUntil);
  return {
    id: String(doc._id),
    jobId: doc.jobId,
    projectId: doc.projectId,
    alert_type: doc.alert_type,
    severity: doc.severity,
    triggered_at: triggeredAt,
    resolved_at: resolvedAt,
    snoozed_until: snoozeUntil,
    message: doc.message,
    recommendation: doc.recommendation,
    affected_metric: doc.affected_metric ?? null,
    affected_model: doc.affected_model ?? null,
    is_dismissed: doc.is_dismissed ?? false,
    days_unresolved: daysUnresolved(triggeredAt),
    is_snoozed: snoozed,
    is_active: !doc.is_dismissed && !resolvedAt && !snoozed,
  };
}

// ─── Alert evaluation helpers ────────────────────────────────────────────────

interface PendingAlert {
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  recommendation: string;
  affected_metric: string | null;
  affected_model: string | null;
}

async function evaluateScoreDrop(db: any, projectId: string): Promise<PendingAlert[]> {
  // PDF: compare current vs 7-day baseline (not "previous run").
  const currentJob = await db
    .collection('jobs')
    .findOne({ projectId, status: 'COMPLETED' }, { sort: { createdAt: -1 }, projection: { id: 1, createdAt: 1 } });
  if (!currentJob?.id || !currentJob?.createdAt) return [];

  const baselineCutoff = new Date(currentJob.createdAt);
  baselineCutoff.setDate(baselineCutoff.getDate() - 7);

  const baselineJob = await db.collection('jobs').findOne(
    { projectId, status: 'COMPLETED', createdAt: { $lte: baselineCutoff } },
    { sort: { createdAt: -1 }, projection: { id: 1 } },
  );
  if (!baselineJob?.id) return [];

  const [curDoc, baseDoc] = await Promise.all([
    db.collection('module_c').findOne(
      { jobId: String(currentJob.id) },
      { projection: { overall_score: 1 }, sort: { timestamp: -1 } } as any,
    ),
    db.collection('module_c').findOne(
      { jobId: String(baselineJob.id) },
      { projection: { overall_score: 1 }, sort: { timestamp: -1 } } as any,
    ),
  ]);

  const current = typeof curDoc?.overall_score === 'number' ? curDoc.overall_score : null;
  const prev = typeof baseDoc?.overall_score === 'number' ? baseDoc.overall_score : null;
  if (current === null || prev === null) return [];

  const drop = prev - current;
  if (drop > 5) {
    return [{
      alert_type: 'score_drop',
      severity: 'critical',
      message: `CRITICAL: Your AI Visibility Score dropped ${drop.toFixed(1)} points this week. Immediate action required.`,
      recommendation: 'Review recent content changes, check schema markup validity, and ensure your key pages are indexed correctly by AI search engines.',
      affected_metric: `AIVS: ${prev.toFixed(1)} → ${current.toFixed(1)}`,
      affected_model: null,
    }];
  }

  return [];
}

async function evaluateCrawlFailure(db: any, jobId: string): Promise<PendingAlert[]> {
  // Check job status for hard failures
  const job = await db
    .collection('jobs')
    .findOne({ id: jobId }, { projection: { status: 1, errorMessage: 1, pagesCrawled: 1 } });

  if (job?.status === 'FAILED') {
    return [{
      alert_type: 'crawl_fail',
      severity: 'critical',
      message: `CRITICAL: The crawl job failed to complete. This impacts your visibility data accuracy.`,
      recommendation: 'Check your site\'s robots.txt, server response codes, and rate limiting settings. Ensure crawl access is permitted for the affected paths.',
      affected_metric: job.errorMessage ? `Error: ${String(job.errorMessage).slice(0, 120)}` : 'Crawl job failed',
      affected_model: null,
    }];
  }

  // PDF: CRITICAL when crawl failure on > 15% of pages.
  // Use pages.status_code (crawler output) with fallback to pages.statusCode.
  const [totalPages, failedPages, summary] = await Promise.all([
    db.collection('job_summaries').findOne({ jobId }, { projection: { total_pages: 1, crawl_status: 1 } }),
    db.collection('pages').countDocuments({
      jobId,
      $or: [
        { status_code: { $gte: 400 } },
        { statusCode: { $gte: 400 } },
      ],
    }),
    db.collection('job_summaries').findOne({ jobId }, { projection: { crawl_status: 1 } }),
  ]);

  const total = typeof (totalPages as any)?.total_pages === 'number'
    ? (totalPages as any).total_pages
    : await db.collection('pages').countDocuments({ jobId });

  if (total > 0) {
    const failPct = (failedPages / total) * 100;
    if (failPct > 15) {
      return [{
        alert_type: 'crawl_fail',
        severity: 'critical',
        message: `CRITICAL: Crawl failures detected on ${failPct.toFixed(0)}% of pages. This impacts your visibility data accuracy.`,
        recommendation: 'Review server response codes for failed URLs, robots.txt rules, redirects, and rate limiting. Fix 4xx/5xx and re-run the crawl to restore full coverage.',
        affected_metric: `${failedPages}/${total} pages failed`,
        affected_model: null,
      }];
    }
  }

  // Soft failure statuses (still useful as a HIGH alert)
  if (summary?.crawl_status === 'failed' || summary?.crawl_status === 'error') {
    return [{
      alert_type: 'crawl_fail',
      severity: 'high',
      message: `Crawl stopped with status "${summary.crawl_status}". Some pages may be missing from analysis.`,
      recommendation: 'Check your site\'s robots.txt, server response codes, and rate limiting settings. Ensure crawl access is permitted for the affected paths.',
      affected_metric: `Crawl status: ${summary.crawl_status}`,
      affected_model: null,
    }];
  }

  return [];
}

async function evaluateCitationLoss(db: any, projectId: string): Promise<PendingAlert[]> {
  // Get two most-recent citation snapshot job groups
  const jobGroups = await db
    .collection('cbm_citation_snapshots')
    .aggregate([
      { $match: { projectId, entityType: 'client' } },
      { $group: { _id: '$jobId', latestCreatedAt: { $max: '$createdAt' } } },
      { $sort: { latestCreatedAt: -1 } },
      { $limit: 2 },
    ])
    .toArray();

  if (jobGroups.length < 2) return [];

  const currentJobId = jobGroups[0]._id as string;
  const priorJobId = jobGroups[1]._id as string;

  const countByJob = await db
    .collection('cbm_citation_snapshots')
    .aggregate([
      { $match: { projectId, entityType: 'client', jobId: { $in: [currentJobId, priorJobId] } } },
      {
        $group: {
          _id: '$jobId',
          totalCitations: { $sum: { $cond: [{ $eq: ['$citationPresent', true] }, 1, 0] } },
          totalDocs: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const byJob: Record<string, { totalCitations: number; totalDocs: number }> = {};
  for (const g of countByJob) byJob[g._id as string] = g;

  const current = byJob[currentJobId];
  const prior = byJob[priorJobId];

  if (!current || !prior || prior.totalCitations === 0) return [];

  const dropPct = ((prior.totalCitations - current.totalCitations) / prior.totalCitations) * 100;

  if (dropPct > 20) {
    return [{
      alert_type: 'citation_loss',
      severity: 'high',
      message: `Citation count dropped ${dropPct.toFixed(0)}% vs last period. This may indicate a content or schema change affected your cite-worthiness.`,
      recommendation: 'Review recent content updates and schema changes. Ensure your brand entity definitions are clear and your content answers common AI queries comprehensively.',
      affected_metric: `${prior.totalCitations} → ${current.totalCitations} citations`,
      affected_model: null,
    }];
  }

  return [];
}

async function evaluateCompetitorCitationGain(db: any, projectId: string): Promise<PendingAlert[]> {
  const jobGroups = await db
    .collection('cbm_citation_snapshots')
    .aggregate([
      { $match: { projectId, entityType: 'competitor' } },
      { $group: { _id: '$jobId', latestCreatedAt: { $max: '$createdAt' } } },
      { $sort: { latestCreatedAt: -1 } },
      { $limit: 2 },
    ])
    .toArray();

  if (jobGroups.length < 2) return [];

  const currentJobId = jobGroups[0]._id as string;
  const priorJobId = jobGroups[1]._id as string;

  const snapshots = await db
    .collection('cbm_citation_snapshots')
    .find(
      { projectId, entityType: 'competitor', jobId: { $in: [currentJobId, priorJobId] } },
      { projection: { jobId: 1, llmModel: 1, entityName: 1, citationPresent: 1 } },
    )
    .toArray();

  // Group by entityName+llmModel for each job
  type Key = string;
  const byJob: Record<string, Record<Key, boolean>> = { [currentJobId]: {}, [priorJobId]: {} };
  for (const s of snapshots) {
    const key = `${s.entityName}||${s.llmModel}`;
    byJob[s.jobId as string][key] = s.citationPresent === true;
  }

  // Find competitors that gained citation on 2+ models
  const currentByEntity: Record<string, { gained: string[]; lost: string[] }> = {};
  for (const [key, hasNow] of Object.entries(byJob[currentJobId])) {
    const [entityName, llmModel] = key.split('||');
    if (!currentByEntity[entityName]) currentByEntity[entityName] = { gained: [], lost: [] };
    const hadBefore = byJob[priorJobId][key] ?? false;
    if (hasNow && !hadBefore) currentByEntity[entityName].gained.push(llmModel);
  }

  const alerts: PendingAlert[] = [];
  for (const [entityName, data] of Object.entries(currentByEntity)) {
    if (data.gained.length >= 2) {
      alerts.push({
        alert_type: 'competitor_citation_gain',
        severity: 'high',
        message: `Competitor "${entityName}" gained citations on ${data.gained.join(', ')} simultaneously.`,
        recommendation: `Analyse what content changes ${entityName} made recently. Look for new long-form content, FAQ schemas, or entity definitions that are earning citations you're missing.`,
        affected_metric: `Gained on: ${data.gained.join(', ')}`,
        affected_model: data.gained.join(', '),
      });
    }
  }

  return alerts;
}

async function evaluateSchemaErrors(db: any, jobId: string): Promise<PendingAlert[]> {
  // Check module_b (schema) collection for validation errors
  const schemaDoc = await db
    .collection('module_b')
    .findOne({ jobId }, { projection: { validation_errors: 1, error_count: 1, total_pages: 1 } });

  if (!schemaDoc) return [];

  const errorCount = typeof schemaDoc.error_count === 'number'
    ? schemaDoc.error_count
    : (Array.isArray(schemaDoc.validation_errors) ? schemaDoc.validation_errors.length : 0);

  if (errorCount > 0) {
    return [{
      alert_type: 'schema_error',
      severity: 'high',
      message: `Schema validation errors detected on ${errorCount} tracked URL${errorCount !== 1 ? 's' : ''}.`,
      recommendation: 'Fix schema markup errors immediately. AI engines rely heavily on structured data to cite and understand your content. Use Google\'s Rich Results Test to verify fixes.',
      affected_metric: `${errorCount} schema error${errorCount !== 1 ? 's' : ''} found`,
      affected_model: null,
    }];
  }

  return [];
}

async function evaluatePromptZeroVisibility(db: any, jobId: string): Promise<PendingAlert[]> {
  // Prompt data lives in module_e.brand_prompt_results, not module_c
  const moduleE = await db
    .collection('module_e')
    .findOne({ jobId }, { projection: { brand_prompt_results: 1 } });

  if (!moduleE || !Array.isArray(moduleE.brand_prompt_results)) return [];

  const zeroPrompts: string[] = [];
  let worstModel: string | null = null;

  for (const p of moduleE.brand_prompt_results) {
    const results = p.results ?? {};
    const models = Object.keys(results);
    const zeroModel = models.find((m) => {
      const score = results[m]?.analysis?.brand_visibility_score;
      return typeof score === 'number' && score === 0;
    });
    if (zeroModel !== undefined) {
      zeroPrompts.push(p.prompt);
      if (!worstModel) worstModel = zeroModel;
    }
  }

  if (zeroPrompts.length === 0) return [];

  return [{
    alert_type: 'prompt_zero_visibility',
    severity: 'medium',
    message: `${zeroPrompts.length} tracked prompt${zeroPrompts.length !== 1 ? 's' : ''} show 0% brand visibility on ${worstModel ?? 'AI models'}.`,
    recommendation: 'Create or optimise content that directly answers these prompts. Include your brand name, clear entity definitions, and structured data to improve visibility.',
    affected_metric: `${zeroPrompts.length} prompt${zeroPrompts.length !== 1 ? 's' : ''} with 0% visibility`,
    affected_model: worstModel,
  }];
}

async function evaluateSovDrop(db: any, projectId: string): Promise<PendingAlert[]> {
  // PDF: Share of Voice drops > 5 points in 30 days.
  const currentJob = await db
    .collection('jobs')
    .findOne({ projectId, status: 'COMPLETED' }, { sort: { createdAt: -1 }, projection: { id: 1, createdAt: 1 } });
  if (!currentJob?.id || !currentJob?.createdAt) return [];

  const baselineCutoff = new Date(currentJob.createdAt);
  baselineCutoff.setDate(baselineCutoff.getDate() - 30);

  const baselineJob = await db.collection('jobs').findOne(
    { projectId, status: 'COMPLETED', createdAt: { $lte: baselineCutoff } },
    { sort: { createdAt: -1 }, projection: { id: 1 } },
  );
  if (!baselineJob?.id) return [];

  const sovForJob = async (jobId: string): Promise<number | null> => {
    const agg = await db.collection('cbm_citation_snapshots').aggregate([
      { $match: { projectId, jobId, entityType: 'client' } },
      {
        $group: {
          _id: null,
          sovSum: { $sum: { $cond: [{ $isNumber: '$shareOfVoice' }, '$shareOfVoice', 0] } },
          sovN: { $sum: { $cond: [{ $isNumber: '$shareOfVoice' }, 1, 0] } },
        },
      },
    ]).toArray();
    if (!agg[0] || (agg[0] as any).sovN <= 0) return null;
    return (agg[0] as any).sovSum / (agg[0] as any).sovN;
  };

  const [current, prev] = await Promise.all([
    sovForJob(String(currentJob.id)),
    sovForJob(String(baselineJob.id)),
  ]);
  if (current === null || prev === null) return [];

  const drop = prev - current;
  if (drop > 5) {
    return [{
      alert_type: 'sov_drop',
      severity: 'medium',
      message: `Share of Voice dropped ${drop.toFixed(1)} points in the last 30 days (${prev.toFixed(1)}% → ${current.toFixed(1)}%).`,
      recommendation: 'Review your competitor activity and content strategy. Focus on prompts where competitors are gaining SOV and create stronger, more comprehensive answers.',
      affected_metric: `SOV: ${prev.toFixed(1)}% → ${current.toFixed(1)}%`,
      affected_model: null,
    }];
  }

  return [];
}

async function evaluateCompetitorNewPage(db: any, projectId: string): Promise<PendingAlert[]> {
  // Check for new competitor snapshot docs in cbm_citation_snapshots
  const jobGroups = await db
    .collection('cbm_citation_snapshots')
    .aggregate([
      { $match: { projectId, entityType: 'competitor' } },
      { $group: { _id: '$jobId', latestCreatedAt: { $max: '$createdAt' } } },
      { $sort: { latestCreatedAt: -1 } },
      { $limit: 2 },
    ])
    .toArray();

  if (jobGroups.length < 2) return [];

  const currentJobId = jobGroups[0]._id as string;
  const priorJobId = jobGroups[1]._id as string;

  const [currentEntities, priorEntities] = await Promise.all([
    db
      .collection('cbm_citation_snapshots')
      .distinct('entityName', { projectId, jobId: currentJobId, entityType: 'competitor' }),
    db
      .collection('cbm_citation_snapshots')
      .distinct('entityName', { projectId, jobId: priorJobId, entityType: 'competitor' }),
  ]);

  const priorSet = new Set(priorEntities as string[]);
  const newEntities = (currentEntities as string[]).filter((e) => !priorSet.has(e));

  if (newEntities.length === 0) return [];

  return [{
    alert_type: 'competitor_new_page',
    severity: 'info',
    message: `${newEntities.length} new competitor${newEntities.length !== 1 ? 's' : ''} detected with AI citation potential: ${newEntities.slice(0, 3).join(', ')}${newEntities.length > 3 ? '…' : ''}.`,
    recommendation: 'Monitor these new competitors closely. Analyse their content structure and citation patterns to stay ahead of emerging threats.',
    affected_metric: `New: ${newEntities.slice(0, 3).join(', ')}`,
    affected_model: null,
  }];
}

// ─── Main service ────────────────────────────────────────────────────────────

export class AlertsService {
  private jobService = new JobService();

  private async getAlertsCollection(): Promise<Collection> {
    const db = await connectToMongo();
    return db.collection('alerts');
  }

  /**
   * Evaluate all trigger rules for a job and upsert resulting alerts.
   * Existing unresolved alerts for the same (jobId, alert_type) are NOT
   * duplicated — they are left as-is so snooze/resolve state is preserved.
   */
  async evaluateAlerts(jobId: string, projectId: string): Promise<void> {
    const db = getMongoDb();
    const col = await this.getAlertsCollection();

    const evaluated = await Promise.allSettled([
      evaluateScoreDrop(db, projectId),
      evaluateCrawlFailure(db, jobId),
      evaluateCitationLoss(db, projectId),
      evaluateCompetitorCitationGain(db, projectId),
      evaluateSchemaErrors(db, jobId),
      evaluatePromptZeroVisibility(db, jobId),
      evaluateSovDrop(db, projectId),
      evaluateCompetitorNewPage(db, projectId),
    ]);

    const allPending: PendingAlert[] = [];
    for (const result of evaluated) {
      if (result.status === 'fulfilled') allPending.push(...result.value);
    }

    for (const pending of allPending) {
      // Only insert if no unresolved, non-dismissed alert of same type exists for this job
      const existing = await col.findOne({
        jobId,
        alert_type: pending.alert_type,
        is_dismissed: false,
        resolved_at: null,
      });

      if (!existing) {
        await col.insertOne({
          jobId,
          projectId,
          ...pending,
          triggered_at: new Date(),
          resolved_at: null,
          snoozed_until: null,
          is_dismissed: false,
          createdAt: new Date(),
        });
        logger.info(`[ALERTS] New alert: ${pending.alert_type} for job ${jobId}`);
      }
    }
  }

  async getAlerts(userId: string, jobId: string): Promise<AlertsListResponse> {
    // Verify access
    const job = await this.jobService.getJobById(userId, jobId);
    const projectId: string = (job as any).projectId;

    if (!projectId) throw new Error('Job not found or access denied');

    // Evaluate fresh alerts before returning (lightweight, cached by dedup logic)
    try {
      await this.evaluateAlerts(jobId, projectId);
    } catch (err) {
      logger.warn(`[ALERTS] Evaluation failed for ${jobId}:`, err);
    }

    const col = await this.getAlertsCollection();
    const docs = await col
      .find({ jobId, is_dismissed: false })
      .sort({ triggered_at: -1 })
      .toArray();

    const alerts = docs.map(toResponse);

    // Filter out snoozed from active counts but still return them
    const active = alerts.filter((a) => a.is_active);

    return {
      alerts,
      active_count: active.length,
      critical_count: active.filter((a) => a.severity === 'critical').length,
      high_count: active.filter((a) => a.severity === 'high').length,
      medium_count: active.filter((a) => a.severity === 'medium').length,
      info_count: active.filter((a) => a.severity === 'info').length,
    };
  }

  async getAlertCount(userId: string, jobId: string): Promise<{ count: number; critical: number }> {
    try {
      const job = await this.jobService.getJobById(userId, jobId);
      const projectId: string = (job as any).projectId;
      if (!projectId) return { count: 0, critical: 0 };

      const col = await this.getAlertsCollection();
      const now = new Date();

      const actives = await col
        .find({
          jobId,
          is_dismissed: false,
          resolved_at: null,
          $or: [{ snoozed_until: null }, { snoozed_until: { $lt: now } }],
        })
        .project({ severity: 1 })
        .toArray();

      return {
        count: actives.length,
        critical: actives.filter((a: any) => a.severity === 'critical').length,
      };
    } catch {
      return { count: 0, critical: 0 };
    }
  }

  async dismissAlert(userId: string, alertId: string): Promise<void> {
    const col = await this.getAlertsCollection();
    const alert = await col.findOne({ _id: new ObjectId(alertId) });
    if (!alert) throw new Error('Alert not found');

    // Verify user has access to this job
    await this.jobService.getJobById(userId, alert.jobId);

    await col.updateOne(
      { _id: new ObjectId(alertId) },
      { $set: { is_dismissed: true } },
    );
  }

  async resolveAlert(userId: string, alertId: string): Promise<void> {
    const col = await this.getAlertsCollection();
    const alert = await col.findOne({ _id: new ObjectId(alertId) });
    if (!alert) throw new Error('Alert not found');

    await this.jobService.getJobById(userId, alert.jobId);

    await col.updateOne(
      { _id: new ObjectId(alertId) },
      { $set: { resolved_at: new Date() } },
    );
  }

  async snoozeAlert(userId: string, alertId: string, days: number = 7): Promise<Date> {
    const col = await this.getAlertsCollection();
    const alert = await col.findOne({ _id: new ObjectId(alertId) });
    if (!alert) throw new Error('Alert not found');

    await this.jobService.getJobById(userId, alert.jobId);

    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);

    await col.updateOne(
      { _id: new ObjectId(alertId) },
      { $set: { snoozed_until: snoozeUntil } },
    );

    return snoozeUntil;
  }
}
