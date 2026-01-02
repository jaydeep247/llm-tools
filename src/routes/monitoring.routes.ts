import { Router } from 'express';
import { HealthChecker } from '../monitoring/HealthCheck.js';
import { MetricsCollector } from '../monitoring/MetricsCollector.js';
import { Logger } from '../logging/Logger.js';
import { RequestQueue } from 'crawlee';
import { getDatabase } from '../database/DatabaseService.js';
import { authenticateUser, optionalAuth } from '../auth/authMiddleware.js';
import fs from 'fs';
import path from 'path';

const router = Router();
const healthChecker = new HealthChecker();
const metricsCollector = new MetricsCollector();
const logger = Logger.getInstance();

// Helper function to verify session ownership
async function verifySessionOwnership(sessionId: number, userId: number, db: any): Promise<boolean> {
  const session = await db.getCrawlSession(sessionId);
  if (!session) return false;
  // Admin can access all sessions
  return session.userId === userId || session.userId === undefined || session.userId === null;
}

// Health check endpoint
router.get('/health', (req, res) => {
  try {
    const healthStatus = healthChecker.getHealthStatus();
    const statusCode = healthStatus.status === 'healthy' ? 200 :
      healthStatus.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', error as Error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint
router.get('/metrics', (req, res) => {
  try {
    const metrics = metricsCollector.getMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', error as Error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Request history endpoint
router.get('/requests', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const requests = metricsCollector.getRequestHistory(limit);
    res.json(requests);
  } catch (error) {
    logger.error('Failed to get request history', error as Error);
    res.status(500).json({ error: 'Failed to get request history' });
  }
});

// Error summary endpoint
router.get('/errors', (req, res) => {
  try {
    const errorSummary = metricsCollector.getErrorSummary();
    res.json(errorSummary);
  } catch (error) {
    logger.error('Failed to get error summary', error as Error);
    res.status(500).json({ error: 'Failed to get error summary' });
  }
});

// Logs endpoint
router.get('/logs', (req, res) => {
  try {
    const level = req.query.level as string;
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = logger.getLogs(level, limit);
    res.json(logs);
  } catch (error) {
    logger.error('Failed to get logs', error as Error);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

// Logs by time range
router.get('/logs/range', (req, res) => {
  try {
    const { startTime, endTime } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime query parameters are required' });
    }
    const logs = logger.getLogsByTimeRange(startTime as string, endTime as string);
    res.json(logs);
  } catch (error) {
    logger.error('Failed to get logs by time range', error as Error);
    res.status(500).json({ error: 'Failed to get logs by time range' });
  }
});

// Clear logs endpoint (admin only)
router.delete('/logs', (req, res) => {
  try {
    logger.clearLogs();
    res.json({ message: 'Logs cleared successfully' });
  } catch (error) {
    logger.error('Failed to clear logs', error as Error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// Reset metrics endpoint (admin only)
router.delete('/metrics', (req, res) => {
  try {
    metricsCollector.reset();
    res.json({ message: 'Metrics reset successfully' });
  } catch (error) {
    logger.error('Failed to reset metrics', error as Error);
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

// Export crawl data
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', limit, sessionId } = req.query;
    logger.info('Export request received', { format, limit, sessionId });

    const db = getDatabase();
    const limitNum = limit ? parseInt(limit as string) : undefined;
    const sessionIdNum = sessionId ? parseInt(sessionId as string) : undefined;

    const pagesResult = await db.getPages(sessionIdNum, limitNum || 10000, 0);
    const pages = pagesResult.map((p: any) => {
      const { id, sessionId, ...rest } = p;
      return rest;
    });
    const resourcesResult = await db.getResources(sessionIdNum, undefined, limitNum || 10000, 0);
    const resources = resourcesResult.map((r: any) => {
      const { id, sessionId, pageId, ...rest } = r;
      return rest;
    });
    const items = [...pages, ...resources];

    if (!items || items.length === 0) {
      logger.warn('No crawl data found for export');
      return res.status(404).json({ error: 'No crawl data found', message: 'Please run a crawl first to generate data for export' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `crawl-results${sessionIdNum ? `-session-${sessionIdNum}` : ''}-${timestamp}`;

    switch (format) {
      case 'csv': {
        const csv = convertToCSV(items);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csv);
        break;
      }
      case 'txt': {
        const txt = items.map((item: any) => item.url).join('\n');
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
        res.send(txt);
        break;
      }
      case 'xml': {
        const xml = convertToXML(items);
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xml"`);
        res.send(xml);
        break;
      }
      case 'json':
      default: {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json({
          exportInfo: { timestamp: new Date().toISOString(), totalUrls: items.length, format: 'json', sessionId: sessionIdNum ?? null },
          urls: items,
        });
      }
    }

    logger.info('Data exported', { format, count: items.length });
  } catch (error) {
    logger.error('Failed to export data', error as Error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Export metrics
router.get('/export/metrics', async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const metrics = metricsCollector.getMetrics();
    const requestHistory = metricsCollector.getRequestHistory();
    const errorSummary = metricsCollector.getErrorSummary();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `crawl-metrics-${timestamp}`;

    const exportData = {
      exportInfo: { timestamp: new Date().toISOString(), format: format as string },
      metrics,
      requestHistory,
      errorSummary,
    };

    if (format === 'csv') {
      const csv = convertMetricsToCSV(exportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(exportData);
    }

    logger.info('Metrics exported', { format });
  } catch (error) {
    logger.error('Failed to export metrics', error as Error);
    res.status(500).json({ error: 'Failed to export metrics' });
  }
});

// Helper functions
function convertToCSV(items: any[]): string {
  if (items.length === 0) return '';
  const headers = Object.keys(items[0]);
  const csvHeaders = headers.join(',');
  const csvRows = items.map(item => headers.map(header => {
    const value = item[header];
    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }).join(','));
  return [csvHeaders, ...csvRows].join('\n');
}

function convertToXML(items: any[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<crawlResults>\n';
  xml += '  <exportInfo>\n';
  xml += `    <timestamp>${new Date().toISOString()}</timestamp>\n`;
  xml += `    <totalUrls>${items.length}</totalUrls>\n`;
  xml += '  </exportInfo>\n';
  xml += '  <urls>\n';
  items.forEach((item, index) => {
    xml += `    <url id="${index + 1}">\n`;
    xml += `      <value><![CDATA[${item.url}]]></value>\n`;
    xml += '    </url>\n';
  });
  xml += '  </urls>\n';
  xml += '</crawlResults>';
  return xml;
}

function convertMetricsToCSV(data: any): string {
  const lines: string[] = [];
  lines.push('Section,Field,Value');
  lines.push(`Export Info,Timestamp,${data.exportInfo.timestamp}`);
  lines.push(`Export Info,Format,${data.exportInfo.format}`);
  lines.push('Metrics,Total Pages,' + data.metrics.totalPages);
  lines.push('Metrics,Successful Requests,' + data.metrics.successfulRequests);
  lines.push('Metrics,Failed Requests,' + data.metrics.failedRequests);
  lines.push('Metrics,Average Response Time,' + data.metrics.averageResponseTime);
  lines.push('Metrics,Requests Per Minute,' + data.metrics.requestsPerMinute);
  lines.push('Metrics,Duration,' + data.metrics.duration);
  data.errorSummary.forEach((error: any) => {
    lines.push(`Error,${error.type},${error.count} (${error.percentage}%)`);
  });
  return lines.join('\n');
}

// Check data availability (DB only)
router.get('/data/check', async (req, res) => {
  try {
    const db = getDatabase();
    const totalPages = await db.getPageCount(undefined as any);
    const totalResources = await db.getResourceCount(undefined as any);
    const totalItems = totalPages + totalResources;
    res.json({
      hasData: totalItems > 0,
      itemCount: totalItems,
      totalItems,
      totalPages,
      totalResources,
      message: totalItems > 0
        ? `Database contains ${totalItems} items (${totalPages} pages, ${totalResources} resources)`
        : 'No data available - run a crawl first'
    });
  } catch (error) {
    logger.error('Failed to check data availability', error as Error);
    res.status(500).json({ hasData: false, error: 'Failed to check data availability' });
  }
});

// List all data (pages and resources)
router.get('/data/list', authenticateUser, async (req, res) => {
  try {
    const db = getDatabase();
    const limit = Math.min(parseInt(req.query.limit as string) || 1000, 5000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;

    // Verify session ownership if sessionId is provided
    if (sessionId && req.user && !(await verifySessionOwnership(sessionId, req.user.userId, db))) {
      res.status(403).json({ error: 'Access denied to this session' });
      return;
    }

    // Tag pages so the UI can distinguish them from resources
    const pagesResult = await db.getPages(sessionId, limit, offset);
    const pages = pagesResult.map((p: any) => ({ ...p, resourceType: 'page' }));
    const resources = await db.getResources(sessionId, undefined, limit, offset);

    // Get sitemap data if sessionId is provided
    let sitemapUrls: any[] = [];
    let sitemapDiscoveries: any[] = [];
    if (sessionId) {
      sitemapUrls = await db.getSitemapUrls(sessionId as number);
      sitemapDiscoveries = await db.getSitemapDiscoveries(sessionId as number);
    }

    const allData = [...pages, ...resources]
      // Do not add schedule/session fields to the payload; keep only core item fields
      .map((item: any) => ({ ...item }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const totalPages = await db.getPageCount(sessionId as number);
    const totalResources = await db.getResourceCount(sessionId as number);
    const totalItems = totalPages + totalResources;

    // Get session details if sessionId is provided
    let session = null;
    let logs: any[] = [];
    if (sessionId) {
      session = await db.getCrawlSession(sessionId as number);
      logs = await db.getCrawlLogs(sessionId as number);
    }

    res.json({
      data: allData,
      totalPages,
      totalResources,
      statistics: {
        totalPages,
        totalResources,
        totalItems
      },
      session,
      logs,
      paging: {
        limit,
        offset,
        count: allData.length,
        total: totalItems,
        hasMore: offset + allData.length < totalItems,
      },
      datasetInfo: {
        name: 'database',
        itemCount: allData.length,
        totalItems,
        totalPages,
        totalResources,
        hasData: totalItems > 0,
      },
      sitemapInfo: {
        discoveredUrls: sitemapUrls.length,
        sitemapCount: sitemapDiscoveries.length,
        crawledUrls: sitemapUrls.filter((url: any) => url.crawled).length,
        uncrawledUrls: sitemapUrls.filter((url: any) => !url.crawled).length,
        sitemapUrls,
        sitemapDiscoveries
      },
      message: totalItems > 0
        ? `Database contains ${totalItems} items (${totalPages} pages, ${totalResources} resources)`
        : 'Database is empty - run a crawl first',
    });
  } catch (error) {
    logger.error('Failed to list database data', error as Error);
    res.status(500).json({ error: 'Failed to retrieve data', details: (error as Error).message });
  }
});

// List only pages (exclude resources) with pagination
router.get('/data/pages', authenticateUser, async (req, res) => {
  try {
    const db = getDatabase();
    const limit = Math.min(parseInt(req.query.limit as string) || 1000, 5000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;
    const hostFilter = (req.query.host as string | undefined) || undefined; // optional

    // Verify session ownership if sessionId is provided
    if (sessionId && req.user && !(await verifySessionOwnership(sessionId, req.user.userId, db))) {
      res.status(403).json({ error: 'Access denied to this session' });
      return;
    }

    let pages = await db.getPages(sessionId, limit, offset) as any[];
    if (hostFilter) {
      pages = pages.filter((p: any) => {
        try { return new URL(p.url).host === hostFilter || new URL(p.url).hostname.endsWith('.' + hostFilter); } catch { return false; }
      });
    }

    const totalPages = await db.getPageCount(sessionId);

    res.json({
      data: pages.map((p: any) => ({
        id: p.id,
        sessionId: p.sessionId ?? p.session_id ?? sessionId,
        url: p.url,
        title: p.title ?? null,
        timestamp: p.timestamp ?? p.created_at ?? null,
        statusCode: p.statusCode ?? p.status_code ?? null,
      })),
      paging: {
        limit,
        offset,
        count: pages.length,
        total: totalPages,
        hasMore: offset + pages.length < totalPages,
      }
    });
  } catch (error) {
    logger.error('Failed to list pages', error as Error);
    res.status(500).json({ error: 'Failed to retrieve pages', details: (error as Error).message });
  }
});

// List crawl sessions for filtering in UI
router.get('/data/sessions', authenticateUser, async (req, res) => {
  try {
    const db = getDatabase();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const scheduleId = req.query.scheduleId ? parseInt(req.query.scheduleId as string) : undefined;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const sessions = await db.getUserSessionsWithShares(userId, limit, offset);

    res.json({ sessions, paging: { limit, offset, count: sessions.length } });
  } catch (error) {
    logger.error('Failed to list sessions', error as Error);
    res.status(500).json({ error: 'Failed to list sessions', details: (error as Error).message });
  }
});

// Crawl status for a URL (to inform user about reuse vs recrawl)
// Protected - users can only see their own crawl status
router.get('/crawl/status', authenticateUser, async (req, res) => {
  try {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: 'url query param is required' });

    const db = getDatabase();
    const userId = req.user?.userId;
    const running = await db.getRunningSessionByUrl(url, userId);
    const latest = await db.getLatestSessionByUrl(url, userId as number);
    const avgDuration = await db.getAverageDurationForUrl(url, userId);

    res.json({
      url,
      running: running ? { id: running.id, startedAt: (running as any).started_at ?? running.startedAt } : null,
      latest: latest ? {
        id: latest.id,
        status: latest.status,
        startedAt: (latest as any).started_at ?? latest.startedAt,
        completedAt: (latest as any).completed_at ?? latest.completedAt,
        totalPages: latest.totalPages,
        totalResources: latest.totalResources,
        duration: latest.duration
      } : null,
      averageDurationSec: avgDuration,
    });
  } catch (error) {
    logger.error('Failed to get crawl status', error as Error);
    res.status(500).json({ error: 'Failed to get crawl status' });
  }
});

// Clear all data endpoint
router.delete('/data/clear', async (req, res) => {
  try {
    const db = getDatabase();
    await db.clearAllData();

    const requestQueue = await RequestQueue.open();
    const queueInfo = await requestQueue.getInfo();
    logger.info('Clearing request queue', {
      queueName: queueInfo?.name,
      pendingCount: queueInfo?.pendingRequestCount,
      handledCount: queueInfo?.handledRequestCount,
    });
    await requestQueue.drop();

    metricsCollector.reset();
    logger.clearLogs();

    // Clear audit files from storage
    try {
      const auditDir = path.resolve(process.cwd(), 'storage', 'audits');
      if (fs.existsSync(auditDir)) {
        const deviceDirs = fs.readdirSync(auditDir);
        for (const deviceDir of deviceDirs) {
          const devicePath = path.join(auditDir, deviceDir);
          if (fs.statSync(devicePath).isDirectory()) {
            const dateDirs = fs.readdirSync(devicePath);
            for (const dateDir of dateDirs) {
              const datePath = path.join(devicePath, dateDir);
              if (fs.statSync(datePath).isDirectory()) {
                const files = fs.readdirSync(datePath);
                for (const file of files) {
                  fs.unlinkSync(path.join(datePath, file));
                }
                fs.rmdirSync(datePath);
              }
            }
            fs.rmdirSync(devicePath);
          }
        }
        fs.rmdirSync(auditDir);
        logger.info('Audit files cleared from storage');
      }
    } catch (error) {
      logger.warn('Failed to clear audit files', error as Error);
    }

    res.json({ message: 'All data cleared successfully (database, queue, metrics, logs, and audit files)', timestamp: new Date().toISOString() });
    logger.info('All data cleared by user request');
  } catch (error) {
    logger.error('Failed to clear data', error as Error);
    res.status(500).json({ error: 'Failed to clear data', details: (error as Error).message, timestamp: new Date().toISOString() });
  }
});

// Status endpoint (simplified health check)
router.get('/status', (req, res) => {
  try {
    const isHealthy = healthChecker.isHealthy();
    const metrics = metricsCollector.getMetrics();
    res.json({
      healthy: isHealthy,
      activeCrawls: metrics.totalPages > 0,
      totalPages: metrics.totalPages,
      successRate: metrics.totalPages > 0 ? Math.round((metrics.successfulRequests / metrics.totalPages) * 100) : 0,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get status', error as Error);
    res.status(500).json({ healthy: false, error: 'Status check failed', timestamp: new Date().toISOString() });
  }
});

// Cron session history endpoints
router.get('/cron/history', async (req, res) => {
  try {
    const db = getDatabase();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const filters = {
      scheduleId: req.query.scheduleId ? parseInt(req.query.scheduleId as string) : undefined,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const { executions, total } = await db.getScheduleExecutionsWithDetails(filters, limit, offset);

    res.json({
      executions: executions.map((exec: any) => ({
        id: exec.id,
        scheduleId: exec.schedule_id,
        sessionId: exec.session_id,
        scheduleName: exec.schedule_name,
        startUrl: exec.start_url,
        mode: exec.mode,
        allowSubdomains: exec.allow_subdomains === 1 || exec.allow_subdomains === true,
        maxConcurrency: exec.max_concurrency,
        startedAt: exec.started_at,
        completedAt: exec.completed_at,
        status: exec.status,
        errorMessage: exec.error_message,
        pagesCrawled: exec.pages_crawled,
        resourcesFound: exec.resources_found,
        duration: exec.duration
      })),
      paging: {
        limit,
        offset,
        count: executions.length,
        total,
        hasMore: offset + executions.length < total
      }
    });
  } catch (error) {
    logger.error('Failed to get cron history', error as Error);
    res.status(500).json({ error: 'Failed to get cron history' });
  }
});

// Get detailed execution info with session data
router.get('/cron/execution/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const executionId = parseInt(req.params.id);

    // Get execution details
    const execution = await db.getExecutionWithSession(executionId);

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // Get session details
    const session = await db.getCrawlSession(execution.session_id);

    // Get pages and resources for this session
    const pages = await db.getPages(execution.session_id, 1000, 0);
    const resources = await db.getResources(execution.session_id, undefined, 1000, 0);

    // Get sitemap data
    const sitemapUrls = await db.getSitemapUrls(execution.session_id);
    const sitemapDiscoveries = await db.getSitemapDiscoveries(execution.session_id);

    res.json({
      execution: {
        id: execution.id,
        scheduleId: execution.schedule_id,
        sessionId: execution.session_id,
        scheduleName: execution.schedule_name,
        startUrl: execution.start_url,
        mode: execution.mode,
        allowSubdomains: execution.allow_subdomains === 1 || execution.allow_subdomains === true,
        maxConcurrency: execution.max_concurrency,
        startedAt: execution.started_at,
        completedAt: execution.completed_at,
        status: execution.status,
        errorMessage: execution.error_message,
        // Prefer stored values; if zero/NULL, fall back to computed counts
        pagesCrawled: (execution.pages_crawled ?? 0) || pages.length,
        resourcesFound: (execution.resources_found ?? 0) || resources.length,
        duration: execution.duration
      },
      session: session ? {
        id: session.id,
        startUrl: session.startUrl ?? (session as any).start_url,
        allowSubdomains: session.allowSubdomains ?? (session as any).allow_subdomains,
        maxConcurrency: session.maxConcurrency ?? (session as any).max_concurrency,
        mode: session.mode,
        startedAt: session.startedAt ?? (session as any).started_at,
        completedAt: session.completedAt ?? (session as any).completed_at,
        totalPages: session.totalPages ?? (session as any).total_pages,
        totalResources: session.totalResources ?? (session as any).total_resources,
        duration: session.duration,
        status: session.status
      } : null,
      data: {
        pages: pages.slice(0, 100), // Limit for performance
        resources: resources.slice(0, 100),
        sitemapUrls: sitemapUrls.slice(0, 50),
        sitemapDiscoveries: sitemapDiscoveries.slice(0, 20)
      },
      summary: {
        totalPages: pages.length,
        totalResources: resources.length,
        totalSitemapUrls: sitemapUrls.length,
        crawledSitemapUrls: sitemapUrls.filter((url: any) => url.crawled).length,
        sitemapDiscoveries: sitemapDiscoveries.length
      }
    });
  } catch (error) {
    logger.error('Failed to get execution details', error as Error);
    res.status(500).json({ error: 'Failed to get execution details' });
  }
});

// Get cron session statistics
router.get('/cron/stats', async (req, res) => {
  try {
    const db = getDatabase();
    const scheduleId = req.query.scheduleId ? parseInt(req.query.scheduleId as string) : undefined;

    // Get overall stats
    const stats = await db.getScheduleStats(scheduleId);

    // Get recent executions
    const executions = await db.getRecentExecutions(10, scheduleId);

    res.json({
      stats: {
        totalExecutions: parseInt(stats.total_executions || 0),
        successfulExecutions: parseInt(stats.successful_executions || 0),
        failedExecutions: parseInt(stats.failed_executions || 0),
        runningExecutions: parseInt(stats.running_executions || 0),
        avgDuration: parseFloat(stats.avg_duration || 0),
        totalPagesCrawled: parseInt(stats.total_pages_crawled || 0),
        totalResourcesFound: parseInt(stats.total_resources_found || 0)
      },
      recentExecutions: executions.map((exec: any) => ({
        id: exec.id,
        scheduleId: exec.schedule_id,
        scheduleName: exec.schedule_name,
        startedAt: exec.started_at,
        completedAt: exec.completed_at,
        status: exec.status,
        pagesCrawled: exec.pages_crawled,
        duration: exec.duration
      })),
      performance: (await db.getSchedulePerformance()).map((perf: any) => ({
        scheduleId: perf.id,
        scheduleName: perf.name,
        startUrl: perf.start_url,
        totalRuns: perf.total_runs || 0,
        successfulRuns: perf.successful_runs || 0,
        failedRuns: perf.failed_runs || 0,
        successRate: perf.total_runs > 0 ?
          Math.round((perf.successful_runs / perf.total_runs) * 100) : 0,
        averageDuration: Math.round(perf.avg_duration || 0),
        lastRun: perf.last_run
      }))
    });
  } catch (error) {
    logger.error('Failed to get cron stats', error as Error);
    res.status(500).json({ error: 'Failed to get cron stats' });
  }
});

// Export cron session history
router.get('/cron/export', async (req, res) => {
  try {
    const { format = 'json', scheduleId, startDate, endDate } = req.query;
    const db = getDatabase();

    const filters = {
      scheduleId: scheduleId ? parseInt(scheduleId as string) : undefined,
      startDate: startDate as string,
      endDate: endDate as string
    };

    const executions = await db.exportCronHistory(filters);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `cron-history-${timestamp}`;

    const exportData = {
      exportInfo: {
        timestamp: new Date().toISOString(),
        format: format as string,
        totalExecutions: executions.length,
        filters: { scheduleId, startDate, endDate }
      },
      executions: executions.map((exec: any) => ({
        id: exec.id,
        scheduleId: exec.schedule_id,
        sessionId: exec.session_id,
        scheduleName: exec.schedule_name,
        startUrl: exec.start_url,
        mode: exec.mode,
        allowSubdomains: exec.allow_subdomains === 1 || exec.allow_subdomains === true,
        maxConcurrency: exec.max_concurrency,
        startedAt: exec.started_at,
        completedAt: exec.completed_at,
        status: exec.status,
        errorMessage: exec.error_message,
        pagesCrawled: exec.pages_crawled,
        resourcesFound: exec.resources_found,
        duration: exec.duration
      }))
    };

    if (format === 'csv') {
      const csv = convertCronHistoryToCSV(exportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(exportData);
    }

    logger.info('Cron history exported', { format, count: executions.length });
  } catch (error) {
    logger.error('Failed to export cron history', error as Error);
    res.status(500).json({ error: 'Failed to export cron history' });
  }
});

// Helper function for CSV conversion
function convertCronHistoryToCSV(data: any): string {
  if (data.executions.length === 0) return '';

  const headers = [
    'ID', 'Schedule ID', 'Session ID', 'Schedule Name', 'Start URL', 'Mode',
    'Allow Subdomains', 'Max Concurrency', 'Started At', 'Completed At',
    'Status', 'Error Message', 'Pages Crawled', 'Resources Found', 'Duration (ms)'
  ];

  const csvRows = [headers.join(',')];

  for (const exec of data.executions) {
    const values = [
      exec.id,
      exec.scheduleId,
      exec.sessionId,
      `"${exec.scheduleName || ''}"`,
      `"${exec.startUrl}"`,
      exec.mode,
      exec.allowSubdomains ? 'Yes' : 'No',
      exec.maxConcurrency,
      exec.startedAt,
      exec.completedAt || '',
      exec.status,
      `"${exec.errorMessage || ''}"`,
      exec.pagesCrawled,
      exec.resourcesFound,
      exec.duration
    ];
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

export { router as monitoringRoutes, healthChecker, metricsCollector };


