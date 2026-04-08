import { Request, Response } from 'express';
import { ExecutiveSnapshotService } from './executiveSnapshot.service';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';

export class ExecutiveSnapshotController {
  private snapshotService = new ExecutiveSnapshotService();

  getSnapshot = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const jobId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)?.trim();

      if (!jobId) {
        return ResponseUtil.error(res, 'Job ID is required', undefined, 400);
      }

      const snapshot = await this.snapshotService.getSnapshot(userId, jobId);
      return ResponseUtil.success(res, 'Executive snapshot retrieved', snapshot);
    } catch (error: any) {
      logger.error(`[EXECUTIVE_SNAPSHOT] ${error.message}`);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve executive snapshot');
    }
  };
}
