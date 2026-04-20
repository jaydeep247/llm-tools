import { ObjectId } from 'mongodb';
import { connectToMongo } from '../../config/mongo';
import type { GeoContentDoc, GeoContentDetail, GeoContentListItem } from './geoContent.types';

const COLLECTION = 'geo_content';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toListItem(doc: any): GeoContentListItem {
  return {
    id: String(doc._id),
    title: doc.title,
    brief: doc.brief,
    wordCount: doc.wordCount ?? 0,
    listicle: doc.listicle ?? false,
    keywords: doc.keywords ?? [],
    status: doc.status ?? 'draft',
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
  };
}

function toDetail(doc: any): GeoContentDetail {
  return {
    ...toListItem(doc),
    htmlContent: doc.htmlContent ?? '',
    targetPrompt: doc.targetPrompt ?? null,
    linkedinUrl: doc.linkedinUrl ?? null,
    wordpressUrl: doc.wordpressUrl ?? null,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class GeoContentRepository {
  private async col() {
    const db = await connectToMongo();
    return db.collection(COLLECTION);
  }

  /** Insert a new GEO content document and return its detail. */
  async create(doc: Omit<GeoContentDoc, '_id'>): Promise<GeoContentDetail> {
    const col = await this.col();
    const _id = new ObjectId();
    await col.insertOne({ ...doc, _id } as any);
    const inserted = await col.findOne({ _id });
    return toDetail(inserted);
  }

  /** Fetch one document by ID scoped to the authenticated user. */
  async findById(id: string, userId: string): Promise<GeoContentDetail | null> {
    const col = await this.col();
    let _id: ObjectId;
    try {
      _id = new ObjectId(id);
    } catch {
      return null;
    }
    const doc = await col.findOne({ _id, userId });
    if (!doc) return null;
    return toDetail(doc);
  }

  /** Paginated list of content records for a user, newest first. */
  async list(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ items: GeoContentListItem[]; total: number; page: number; pages: number }> {
    const col = await this.col();
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      col.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments({ userId }),
    ]);
    return {
      items: docs.map(toListItem),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /** Update the title of a document. */
  async updateTitle(id: string, userId: string, title: string): Promise<boolean> {
    const col = await this.col();
    let _id: ObjectId;
    try {
      _id = new ObjectId(id);
    } catch {
      return false;
    }
    const result = await col.updateOne(
      { _id, userId },
      { $set: { title, updatedAt: new Date() } },
    );
    return result.matchedCount > 0;
  }

  /** Ensure MongoDB indexes exist. */
  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex({ userId: 1, createdAt: -1 });
  }
}
