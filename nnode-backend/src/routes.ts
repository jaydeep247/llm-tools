import { Router } from 'express';
import { env } from './config/env';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/user/user.routes';
import projectRoutes from './modules/project/project.routes';
import sessionRoutes from './modules/session/session.routes';
import jobRoutes from './modules/job/job.routes';
import { authMiddleware } from './middlewares/auth.middleware';
import { connectToMongo } from './config/mongo';
import { logger } from './shared/logger/logger';
import moduleERoutes from './modules/module_E/moduleE.routes';
import moduleCRoutes from './modules/module_C/moduleC.routes';
import moduleFRoutes from './modules/module_F/moduleF.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

router.post('/seo/extract', authMiddleware, async (req, res) => {
  try {
    const { url, jobId } = req.body ?? {};
    const finalUrl = url || req.body?.final_url;

    if (!finalUrl) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ error: 'jobId is required' });
    }

    const db = await connectToMongo();
    const collection = db.collection('fields');

    const buildFilter = (u: string) => {
      return { jobId, url: u };
    };

    let doc = await collection.find(buildFilter(finalUrl)).sort({ createdAt: -1 }).limit(1).toArray();

    if (!doc.length) {
      const altUrl = finalUrl.endsWith('/') ? finalUrl.slice(0, -1) : finalUrl + '/';
      doc = await collection.find(buildFilter(altUrl)).sort({ createdAt: -1 }).limit(1).toArray();
    }

    if (!doc.length) {
      return res.status(404).json({ error: 'SEO fields not found', url: finalUrl, jobId });
    }

    const fieldsDoc: any = doc[0];
    const keywordAnalysis = fieldsDoc.Keyword_analysis;

    if (!keywordAnalysis || !Array.isArray(keywordAnalysis.keywords)) {
      return res.status(404).json({ error: 'Keyword analysis not available for URL', url: finalUrl, jobId });
    }

    return res.json({
      url: fieldsDoc.url,
      language: keywordAnalysis.language ?? fieldsDoc.language ?? null,
      parent: keywordAnalysis.parent ?? null,
      keywords: keywordAnalysis.keywords ?? [],
      cached: true,
    });
  } catch (error: any) {
    logger.error(`Error getting SEO fields: ${error.message}`);
    return res.status(500).json({
      error: 'SEO extraction lookup failed',
      details: error.message,
    });
  }
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/', sessionRoutes);
router.use('/', jobRoutes);
router.use('/', moduleERoutes);
router.use('/', moduleCRoutes);
router.use('/', moduleFRoutes);

export default router;
