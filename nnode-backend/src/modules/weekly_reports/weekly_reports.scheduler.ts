import { connectToMongo } from '../../config/mongo';
import { logger } from '../../shared/logger/logger';
import { ProjectStatus } from '../project/project.types';
import { WeeklyReportsService } from './weekly_reports.service';

let started = false;
let lastRunUtcHourKey: string | null = null;

/**
 * Sunday 23:59 UTC: generate a weekly report for each active project (owner context).
 */
export function startWeeklyReportsScheduler(): void {
  if (started) return;
  started = true;

  const svc = new WeeklyReportsService();
  svc.ensureIndexes().catch(() => {});

  setInterval(async () => {
    const now = new Date();
    if (now.getUTCDay() !== 0) return;
    if (now.getUTCHours() !== 23 || now.getUTCMinutes() < 59) return;

    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    if (lastRunUtcHourKey === hourKey) return;
    lastRunUtcHourKey = hourKey;

    try {
      const db = await connectToMongo();
      const projects = await db
        .collection('projects')
        .find({ status: ProjectStatus.ACTIVE })
        .project({ id: 1, userId: 1 })
        .toArray();

      logger.info(`[WEEKLY_REPORTS_CRON] Running for ${projects.length} projects`);
      for (const p of projects) {
        const projectId = p.id as string;
        const userId = p.userId as string;
        if (!projectId || !userId) continue;
        await svc.generateForProjectInternal(projectId, userId).catch((err: any) => {
          logger.warn(`[WEEKLY_REPORTS_CRON] project=${projectId} ${err?.message}`);
        });
      }
    } catch (e: any) {
      logger.error(`[WEEKLY_REPORTS_CRON] ${e?.message}`);
    }
  }, 60_000);

  logger.info('[WEEKLY_REPORTS_CRON] Scheduler started (Sunday 23:59 UTC)');
}
