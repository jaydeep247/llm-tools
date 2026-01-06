import { Pool } from 'pg';
import { Page, Resource } from '../types.js';

export class PageRepository {
    constructor(private pool: Pool) { }

    private safeInt(val: any): number | null {
        if (val === undefined || val === null) return null;
        if (typeof val === 'number') return Math.round(val);
        const parsed = parseFloat(val);
        return isNaN(parsed) ? null : Math.round(parsed);
    }

    async insertPage(data: Omit<Page, 'id'>): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO pages 
      (session_id, url, title, title_length, description, description_length, content_type, last_modified, status_code, response_time, word_count, timestamp, success, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id`,
            [
                this.safeInt(data.sessionId), data.url, data.title, this.safeInt(data.titleLength) || 0,
                data.description, this.safeInt(data.descriptionLength) || 0, data.contentType,
                data.lastModified, this.safeInt(data.statusCode), this.safeInt(data.responseTime),
                this.safeInt(data.wordCount) || 0, data.timestamp, data.success, data.errorMessage
            ]
        );
        return res.rows[0].id;
    }

    async insertResource(data: Omit<Resource, 'id'>): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO resources 
      (session_id, page_id, url, resource_type, title, description, content_type, status_code, response_time, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT(session_id, url) DO UPDATE SET
        page_id=EXCLUDED.page_id,
        resource_type=EXCLUDED.resource_type,
        title=EXCLUDED.title,
        description=EXCLUDED.description,
        content_type=EXCLUDED.content_type,
        status_code=EXCLUDED.status_code,
        response_time=EXCLUDED.response_time,
        timestamp=EXCLUDED.timestamp
      RETURNING id`,
            [
                this.safeInt(data.sessionId), this.safeInt(data.pageId), data.url, data.resourceType,
                data.title, data.description, data.contentType,
                this.safeInt(data.statusCode), this.safeInt(data.responseTime), data.timestamp
            ]
        );
        return res.rows[0]?.id || 0;
    }

    async getPages(sessionId?: number, limit: number = 1000, offset: number = 0): Promise<Page[]> {
        let sql = 'SELECT * FROM pages';
        const params: any[] = [];

        if (sessionId) {
            sql += ' WHERE session_id = $1';
            params.push(sessionId);
        }

        sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const res = await this.pool.query(sql, params);
        return res.rows.map(row => this.mapPage(row));
    }

    async getResources(sessionId?: number, resourceType?: string, limit: number = 1000, offset: number = 0): Promise<Resource[]> {
        let sql = 'SELECT * FROM resources';
        const conditions: string[] = [];
        const params: any[] = [];

        if (sessionId) {
            conditions.push(`session_id = $${params.length + 1}`);
            params.push(sessionId);
        }

        if (resourceType) {
            conditions.push(`resource_type = $${params.length + 1}`);
            params.push(resourceType);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const res = await this.pool.query(sql, params);
        return res.rows.map(row => this.mapResource(row));
    }

    async insertLinks(links: any[]): Promise<void> {
        if (links.length === 0) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const link of links) {
                await client.query(
                    `INSERT INTO links 
          (session_id, source_page_id, source_url, target_url, target_page_id, is_internal, anchor_text, xpath, position, rel, nofollow, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
                    [
                        link.sessionId, link.sourcePageId, link.sourceUrl, link.targetUrl,
                        link.targetPageId || null, link.isInternal, link.anchorText || null,
                        link.xpath || null, link.position || null, link.rel || null,
                        link.nofollow || false
                    ]
                );
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async getPageCount(sessionId?: number): Promise<number> {
        let sql = 'SELECT COUNT(*) FROM pages';
        const params: any[] = [];
        if (sessionId) {
            sql += ' WHERE session_id = $1';
            params.push(sessionId);
        }
        const res = await this.pool.query(sql, params);
        return parseInt(res.rows[0].count);
    }

    async getResourceCount(sessionId?: number): Promise<number> {
        let sql = 'SELECT COUNT(*) FROM resources';
        const params: any[] = [];
        if (sessionId) {
            sql += ' WHERE session_id = $1';
            params.push(sessionId);
        }
        const res = await this.pool.query(sql, params);
        return parseInt(res.rows[0].count);
    }

    async getResourceTypeStats(sessionId?: number): Promise<any[]> {
        let sql = 'SELECT resource_type as type, COUNT(*) as count FROM resources';
        const params: any[] = [];
        if (sessionId) {
            sql += ' WHERE session_id = $1';
            params.push(sessionId);
        }
        sql += ' GROUP BY resource_type';
        const res = await this.pool.query(sql, params);
        return res.rows;
    }

    async getLinkAnalysis(sessionId?: number): Promise<any[]> {
        const params: any[] = [];
        let whereClause = '';
        if (sessionId) {
            whereClause = ' WHERE p.session_id = $1';
            params.push(sessionId);
        }

        const sql = `
            SELECT 
                p.id, 
                p.url, 
                p.title,
                (SELECT COUNT(*) FROM links l WHERE l.target_page_id = p.id ${sessionId ? `AND l.session_id = $1` : ''}) as inlinks,
                (SELECT COUNT(*) FROM links l WHERE l.source_page_id = p.id ${sessionId ? `AND l.session_id = $1` : ''}) as outlinks
            FROM pages p
            ${whereClause}
            ORDER BY inlinks DESC
        `;
        const res = await this.pool.query(sql, [sessionId]);
        return res.rows;
    }

    async getAllLinksForSession(sessionId: number): Promise<any[]> {
        const sql = `
            SELECT l.*, sp.url as source_url, sp.title as source_title, tp.url as target_url, tp.title as target_title
            FROM links l
            LEFT JOIN pages sp ON l.source_page_id = sp.id
            LEFT JOIN pages tp ON l.target_page_id = tp.id
            WHERE l.session_id = $1
            ORDER BY l.created_at DESC
        `;
        const res = await this.pool.query(sql, [sessionId]);
        return res.rows;
    }

    // New Link methods for links.routes.ts
    async getLinksByPage(pageId: number, type: 'in' | 'out' | 'all' = 'out', limit: number = 100): Promise<any[]> {
        let sql = '';
        const params: any[] = [pageId, limit];

        if (type === 'out') {
            sql = `
        SELECT 
            l.id,
            l.session_id as "sessionId",
            l.source_page_id as "sourcePageId",
            COALESCE(sp.url, l.source_url) as "sourceUrl",
            COALESCE(tp.url, l.target_url) as "targetUrl",
            l.target_page_id as "targetPageId",
            l.is_internal as "isInternal",
            l.anchor_text as "anchorText",
            l.xpath,
            l.position,
            l.rel,
            l.nofollow,
            l.created_at as "createdAt",
            tp.title as "targetTitle"
        FROM links l
        LEFT JOIN pages tp ON l.target_page_id = tp.id
        LEFT JOIN pages sp ON l.source_page_id = sp.id
        WHERE l.source_page_id = $1
        LIMIT $2
      `;
        } else if (type === 'in') {
            sql = `
        SELECT 
            l.id,
            l.session_id as "sessionId",
            l.source_page_id as "sourcePageId",
            COALESCE(sp.url, l.source_url) as "sourceUrl",
            COALESCE(tp.url, l.target_url) as "targetUrl",
            l.target_page_id as "targetPageId",
            l.is_internal as "isInternal",
            l.anchor_text as "anchorText",
            l.xpath,
            l.position,
            l.rel,
            l.nofollow,
            l.created_at as "createdAt",
            sp.title as "sourceTitle"
        FROM links l
        LEFT JOIN pages sp ON l.source_page_id = sp.id
        LEFT JOIN pages tp ON l.target_page_id = tp.id
        WHERE l.target_page_id = $1
        LIMIT $2
      `;
        } else {
            sql = `
        SELECT 
            l.id,
            l.session_id as "sessionId",
            l.source_page_id as "sourcePageId",
            COALESCE(sp.url, l.source_url) as "sourceUrl",
            COALESCE(tp.url, l.target_url) as "targetUrl",
            l.target_page_id as "targetPageId",
            l.is_internal as "isInternal",
            l.anchor_text as "anchorText",
            l.xpath,
            l.position,
            l.rel,
            l.nofollow,
            l.created_at as "createdAt",
            sp.title as "sourceTitle",
            tp.title as "targetTitle"
        FROM links l
        LEFT JOIN pages sp ON l.source_page_id = sp.id
        LEFT JOIN pages tp ON l.target_page_id = tp.id
        WHERE l.source_page_id = $1 OR l.target_page_id = $1
        LIMIT $2
      `;
        }

        const res = await this.pool.query(sql, params);
        return res.rows;
    }

    async getLinkStats(sessionId: number): Promise<any> {
        const sql = `
      SELECT 
        COUNT(*) as "totalLinks",
        COUNT(CASE WHEN is_internal = TRUE THEN 1 END) as "internalLinks",
        COUNT(CASE WHEN is_internal = FALSE THEN 1 END) as "externalLinks",
        COUNT(CASE WHEN nofollow = TRUE THEN 1 END) as "nofollowLinks"
      FROM links
      WHERE session_id = $1
    `;
        const res = await this.pool.query(sql, [sessionId]);
        const row = res.rows[0];

        // Get links by position
        const positionSql = `
            SELECT position, COUNT(*) as count
            FROM links
            WHERE session_id = $1 AND position IS NOT NULL
            GROUP BY position
        `;
        const positionRes = await this.pool.query(positionSql, [sessionId]);
        const linksByPosition: Record<string, number> = {};
        positionRes.rows.forEach(r => {
            linksByPosition[r.position] = parseInt(r.count);
        });

        return {
            totalLinks: parseInt(row.totalLinks),
            internalLinks: parseInt(row.internalLinks),
            externalLinks: parseInt(row.externalLinks),
            nofollowLinks: parseInt(row.nofollowLinks),
            linksByPosition
        };
    }

    async getPageLinkStats(sessionId: number): Promise<any[]> {
        const sql = `
      SELECT 
        p.id as "pageId", p.url, p.title,
        (SELECT COUNT(*) FROM links l WHERE l.source_page_id = p.id) as "outlinksCount",
        (SELECT COUNT(*) FROM links l WHERE l.target_page_id = p.id) as "inlinksCount"
      FROM pages p
      WHERE p.session_id = $1
      ORDER BY "inlinksCount" DESC
      LIMIT 100
    `;
        const res = await this.pool.query(sql, [sessionId]);
        return res.rows.map(row => ({
            ...row,
            outlinksCount: parseInt(row.outlinksCount),
            inlinksCount: parseInt(row.inlinksCount)
        }));
    }

    async getLinkRelationships(sessionId: number, limit: number = 50): Promise<any[]> {
        const sql = `
      SELECT 
        l.source_page_id as "sourcePageId",
        sp.url as "sourceUrl",
        sp.title as "sourceTitle",
        l.target_page_id as "targetPageId",
        tp.url as "targetUrl",
        tp.title as "targetTitle",
        COUNT(*) as "linkCount",
        ARRAY_AGG(DISTINCT l.anchor_text) as "anchorTexts"
      FROM links l
      JOIN pages sp ON l.source_page_id = sp.id
      JOIN pages tp ON l.target_page_id = tp.id
      WHERE l.session_id = $1
      GROUP BY l.source_page_id, sp.url, sp.title, l.target_page_id, tp.url, tp.title
      ORDER BY "linkCount" DESC
      LIMIT $2
    `;
        const res = await this.pool.query(sql, [sessionId, limit]);
        return res.rows;
    }

    // SEO Cache methods
    async getSeoData(url: string): Promise<any | null> {
        const sql = 'SELECT * FROM seo_cache WHERE url = $1';
        const res = await this.pool.query(sql, [url]);
        if (res.rows.length === 0) return null;

        const row = res.rows[0];
        const isExpired = new Date() > new Date(row.expires_at);

        return {
            url: row.url,
            parentText: row.parent_text,
            keywords: JSON.parse(row.keywords || '[]'),
            language: row.language,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            expiresAt: row.expires_at,
            isExpired: new Date() > new Date(row.expires_at)
        };
    }

    async saveSeoData(data: { url: string, parentText?: string, keywords: any[], language?: string, expiresAt: string }): Promise<void> {
        const sql = `
      INSERT INTO seo_cache (url, parent_text, keywords, language, expires_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT(url) DO UPDATE SET
        parent_text = EXCLUDED.parent_text,
        keywords = EXCLUDED.keywords,
        language = EXCLUDED.language,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `;
        await this.pool.query(sql, [
            data.url,
            data.parentText || null,
            JSON.stringify(data.keywords),
            data.language || null,
            data.expiresAt
        ]);
    }

    // Sitemap methods
    async insertSitemapDiscovery(data: { sessionId: number, sitemapUrl: string, discoveredUrls: number, lastModified: string, success: boolean, errorMessage?: string }): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO sitemap_discoveries (session_id, sitemap_url, discovered_urls, last_modified, success, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
            [data.sessionId, data.sitemapUrl, data.discoveredUrls, data.lastModified, data.success, data.errorMessage || null]
        );
        return res.rows[0].id;
    }

    async insertSitemapUrl(data: { sessionId: number, url: string, lastModified?: string, changeFrequency?: string, priority?: string }): Promise<void> {
        await this.pool.query(
            `INSERT INTO sitemap_urls (session_id, url, last_modified, change_frequency, priority)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
            [data.sessionId, data.url, data.lastModified || null, data.changeFrequency || null, data.priority || null]
        );
    }

    async getSitemapUrls(sessionId: number): Promise<any[]> {
        const res = await this.pool.query('SELECT * FROM sitemap_urls WHERE session_id = $1', [sessionId]);
        return res.rows;
    }

    async getSitemapDiscoveries(sessionId: number): Promise<any[]> {
        const res = await this.pool.query('SELECT * FROM sitemap_discoveries WHERE session_id = $1', [sessionId]);
        return res.rows;
    }

    async getUncrawledSitemapUrls(sessionId: number): Promise<any[]> {
        const res = await this.pool.query(
            "SELECT url FROM sitemap_urls WHERE session_id = $1 AND crawled = FALSE",
            [sessionId]
        );
        return res.rows;
    }

    async markSitemapUrlAsCrawled(sessionId: number, url: string): Promise<void> {
        await this.pool.query(
            "UPDATE sitemap_urls SET crawled = TRUE WHERE session_id = $1 AND url = $2",
            [sessionId, url]
        );
    }

    async resolveTargetPageIds(sessionId: number): Promise<number> {
        const res = await this.pool.query(
            `UPDATE links l
       SET target_page_id = p.id
       FROM pages p
       WHERE l.session_id = $1 
       AND p.session_id = $1
       AND l.target_url = p.url
       AND l.target_page_id IS NULL`,
            [sessionId]
        );
        return res.rowCount || 0;
    }

    private mapPage(row: any): Page {
        return {
            id: row.id,
            sessionId: row.session_id,
            url: row.url,
            title: row.title,
            titleLength: row.title_length,
            description: row.description,
            descriptionLength: row.description_length,
            contentType: row.content_type,
            lastModified: row.last_modified,
            statusCode: row.status_code,
            responseTime: row.response_time,
            wordCount: row.word_count,
            timestamp: row.timestamp,
            success: row.success,
            errorMessage: row.error_message
        };
    }

    private mapResource(row: any): Resource {
        return {
            id: row.id,
            sessionId: row.session_id,
            pageId: row.page_id,
            url: row.url,
            resourceType: row.resource_type,
            title: row.title,
            description: row.description,
            contentType: row.content_type,
            statusCode: row.status_code,
            responseTime: row.response_time,
            timestamp: row.timestamp
        };
    }
}
