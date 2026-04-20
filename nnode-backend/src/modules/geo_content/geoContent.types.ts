import { ObjectId } from 'mongodb';

// ─── MongoDB Document ─────────────────────────────────────────────────────────

export interface GeoContentDoc {
  _id: ObjectId;
  userId: string;
  brandId: string | null;
  title: string;
  htmlContent: string;
  brief: string;
  keywords: string[];
  targetPrompt: string | null;
  listicle: boolean;
  wordCount: number;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'published';
  linkedinUrl: string | null;
  wordpressUrl: string | null;
}

// ─── Service / Request Types ──────────────────────────────────────────────────

export interface GenerateGeoContentParams {
  brief: string;
  title?: string;
  keywords?: string[];
  targetPrompt?: string;
  listicle?: boolean;
  brandId?: string;
}

// ─── API Response Shapes ──────────────────────────────────────────────────────

export interface GeoContentListItem {
  id: string;
  title: string;
  brief: string;
  wordCount: number;
  listicle: boolean;
  keywords: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeoContentDetail extends GeoContentListItem {
  htmlContent: string;
  targetPrompt: string | null;
  linkedinUrl: string | null;
  wordpressUrl: string | null;
}
