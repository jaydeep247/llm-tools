import { ObjectId } from 'mongodb';
import { connectToMongo } from '../../config/mongo';
import type { BrandMentionDoc, MentionResult, ListQueryParams } from './brandMentions.types';

const COLLECTION = 'brand_mentions';

function toResult(doc: any): MentionResult {
  return {
    id: String(doc._id),
    brandName: doc.brandName,
    domain: doc.domain,
    query: doc.query,
    rank: doc.rank,
    found_url: doc.found_url,
    title: doc.title,
    snippet: doc.snippet,
    source_domain: doc.source_domain,
    found_date: doc.found_date instanceof Date ? doc.found_date.toISOString() : String(doc.found_date),
  };
}

export class BrandMentionsRepository {
  private async col() {
    const db = await connectToMongo();
    return db.collection(COLLECTION);
  }

  /** Insert new mentions, skipping those whose found_url already exists for (userId, domain). */
  async insertNew(docs: Omit<BrandMentionDoc, '_id'>[]): Promise<{ inserted: number; skipped: number }> {
    if (!docs.length) return { inserted: 0, skipped: 0 };
    const col = await this.col();

    const urls = docs.map((d) => d.found_url);
    const existing = await col
      .find({ userId: docs[0].userId, domain: docs[0].domain, found_url: { $in: urls } }, { projection: { found_url: 1 } })
      .toArray();
    const existingUrls = new Set(existing.map((e: any) => e.found_url));

    const fresh = docs.filter((d) => !existingUrls.has(d.found_url));
    if (fresh.length) {
      await col.insertMany(fresh.map((d) => ({ ...d, _id: new ObjectId() as any })));
    }

    return { inserted: fresh.length, skipped: docs.length - fresh.length };
  }

  async list(
    userId: string,
    params: ListQueryParams,
  ): Promise<{ mentions: MentionResult[]; total: number }> {
    const col = await this.col();
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit ?? '20', 10)));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { userId };
    if (params.brandName) filter.brandName = params.brandName;
    if (params.domain) filter.domain = params.domain;
    if (params.query) filter.query = { $regex: params.query, $options: 'i' };
    if (params.sourceDomain) filter.source_domain = { $regex: params.sourceDomain, $options: 'i' };
    if (params.dateFrom || params.dateTo) {
      filter.found_date = {};
      if (params.dateFrom) filter.found_date.$gte = new Date(params.dateFrom);
      if (params.dateTo) filter.found_date.$lte = new Date(params.dateTo);
    }

    const [docs, total] = await Promise.all([
      col.find(filter).sort({ found_date: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
    ]);

    return { mentions: docs.map(toResult), total };
  }

  async dashboard(userId: string): Promise<{
    total: number;
    newLast7d: number;
    topDomains: { domain: string; count: number }[];
    recent: MentionResult[];
  }> {
    const col = await this.col();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, newLast7d, topDomains, recent] = await Promise.all([
      col.countDocuments({ userId }),
      col.countDocuments({ userId, found_date: { $gte: since7d } }),
      col
        .aggregate([
          { $match: { userId } },
          { $group: { _id: '$source_domain', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          { $project: { _id: 0, domain: '$_id', count: 1 } },
        ])
        .toArray(),
      col.find({ userId }).sort({ found_date: -1 }).limit(10).toArray(),
    ]);

    return {
      total,
      newLast7d,
      topDomains: topDomains as { domain: string; count: number }[],
      recent: recent.map(toResult),
    };
  }

  async exportAll(userId: string, params: ListQueryParams): Promise<MentionResult[]> {
    const col = await this.col();

    const filter: Record<string, any> = { userId };
    if (params.brandName) filter.brandName = params.brandName;
    if (params.domain) filter.domain = params.domain;
    if (params.query) filter.query = { $regex: params.query, $options: 'i' };
    if (params.sourceDomain) filter.source_domain = { $regex: params.sourceDomain, $options: 'i' };
    if (params.dateFrom || params.dateTo) {
      filter.found_date = {};
      if (params.dateFrom) filter.found_date.$gte = new Date(params.dateFrom);
      if (params.dateTo) filter.found_date.$lte = new Date(params.dateTo);
    }

    const docs = await col.find(filter).sort({ found_date: -1 }).toArray();
    return docs.map(toResult);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ userId: 1, found_date: -1 }),
      col.createIndex({ userId: 1, domain: 1, found_url: 1 }, { unique: true }),
      col.createIndex({ userId: 1, source_domain: 1 }),
    ]);
  }
}
