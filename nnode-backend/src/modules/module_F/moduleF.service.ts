import { moduleFRepository } from './moduleF.repository';
import { JobService } from '../job/job.service';
import type { ModuleFResult, ModuleFTrends } from './moduleF.types';

export class ModuleFService {
  private jobService: JobService;

  constructor() {
    this.jobService = new JobService();
  }

  async getModuleFResult(jobId: string, userId: string): Promise<ModuleFResult | null> {
    await this.jobService.getJobById(userId, jobId);
    return await moduleFRepository.getModuleFResultByJobId(jobId);
  }

  async getModuleFTrends(jobId: string, userId: string): Promise<ModuleFTrends | null> {
    const job = await this.jobService.getJobById(userId, jobId);
    if (!job || !job.url) return null;

    const history = await moduleFRepository.getModuleFHistoryByUrl(job.url);
    if (!history.length) return null;

    // Filter valid history points
    const validHistory = history.filter(h => 
      h.compare_visibility_against_competitors?.brand
    );

    const trendPoints = validHistory.map(h => {
      const comp = h.compare_visibility_against_competitors!;
      return {
        date: h.createdAt || new Date().toISOString(),
        jobId: h.jobId,
        brand: {
          name: comp.brand?.name || 'Brand',
          visibility_score: comp.brand?.visibility_score || 0,
          market_share_percent: comp.brand?.market_share_percent || 0,
          mentions_total: comp.brand?.mentions_total || 0,
        },
        competitors: (comp.competitors || []).map(c => ({
          name: c.name,
          visibility_score: c.visibility_score,
          market_share_percent: c.market_share_percent,
          mentions_total: c.mentions_total,
        }))
      };
    });

    const growth_rates = {
      brand_visibility: 0,
      brand_market_share: 0,
      competitors: {} as Record<string, { visibility: number; market_share: number }>
    };

    if (trendPoints.length > 1) {
      const current = trendPoints[trendPoints.length - 1];
      const previous = trendPoints[trendPoints.length - 2];

      // Brand
      if (previous.brand.visibility_score > 0) {
        growth_rates.brand_visibility = ((current.brand.visibility_score - previous.brand.visibility_score) / previous.brand.visibility_score) * 100;
      }
      growth_rates.brand_market_share = current.brand.market_share_percent - previous.brand.market_share_percent;

      // Competitors
      current.competitors.forEach(c => {
        const prevC = previous.competitors.find(pc => pc.name === c.name);
        if (prevC) {
          let visGrowth = 0;
          if (prevC.visibility_score > 0) {
            visGrowth = ((c.visibility_score - prevC.visibility_score) / prevC.visibility_score) * 100;
          }
          growth_rates.competitors[c.name] = {
            visibility: visGrowth,
            market_share: c.market_share_percent - prevC.market_share_percent
          };
        }
      });
    }

    return {
      history: trendPoints,
      growth_rates
    };
  }
}

