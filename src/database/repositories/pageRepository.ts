import { Pool } from 'pg';
import { Page, Resource } from '../types.js';
import type { ContentFingerprint, NearDuplicateMetrics, SimilarityResult } from '../../modules/module_A/duplicateDetection/types.js';

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
      (session_id, url, title, title_length, title_pixel_width, description, description_length, description_pixel_width, content_type, last_modified, status_code, response_time, word_count, sentence_count, average_words_per_sentence, flesch_reading_ease_score, readability_level, text_to_html_ratio, crawl_depth, folder_depth, size_bytes, timestamp, success, error_message, indexable, indexability_status, meta_keywords, meta_keywords_length, meta_robots, x_robots_tag, meta_refresh, canonical_url, rel_next, rel_prev, http_rel_next, http_rel_prev, amphtml_url, transferred_bytes, total_transferred_bytes, co2_mg, carbon_rating, heading_tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42)
      RETURNING id`,
            [
                this.safeInt(data.sessionId), data.url, data.title, this.safeInt(data.titleLength) || 0,
                this.safeInt(data.titlePixelWidth),
                data.description, this.safeInt(data.descriptionLength) || 0,
                this.safeInt(data.descriptionPixelWidth),
                data.contentType,
                data.lastModified, this.safeInt(data.statusCode), this.safeInt(data.responseTime),
                this.safeInt(data.wordCount) || 0, this.safeInt(data.sentenceCount) || 0,
                data.averageWordsPerSentence !== undefined && data.averageWordsPerSentence !== null ? parseFloat(data.averageWordsPerSentence.toString()) : null,
                data.fleschReadingEase !== undefined && data.fleschReadingEase !== null ? parseFloat(data.fleschReadingEase.toString()) : null,
                data.readabilityLevel && data.readabilityLevel.trim().length > 0 ? data.readabilityLevel.trim() : null,
                data.textToHtmlRatio !== undefined && data.textToHtmlRatio !== null ? parseFloat(data.textToHtmlRatio.toString()) : null,
                this.safeInt(data.crawlDepth) || 0,
                this.safeInt(data.folderDepth) || 0,
                this.safeInt(data.sizeBytes),
                data.timestamp, data.success, data.errorMessage,
                data.indexable !== undefined ? data.indexable : true,
                data.indexabilityStatus || 'indexable',
                data.metaKeywords || null,
                this.safeInt(data.metaKeywordsLength),
                data.metaRobots || null,
                data.xRobotsTag || null,
                data.metaRefresh || null,
                data.canonicalUrl || null,
                data.relNext || null,
                data.relPrev || null,
                data.httpRelNext || null,
                data.httpRelPrev || null,
                data.amphtmlUrl || null,
                this.safeInt(data.transferredBytes),
                this.safeInt(data.totalTransferredBytes),
                data.co2Mg ? parseFloat(data.co2Mg.toString()) : null,
                data.carbonRating || null,
                data.headingTags || null
            ]
        );
        return res.rows[0].id;
    }

    /**
     * Insert or update a content fingerprint for a page.
     * Uses ON CONFLICT to keep the latest fingerprint per (page_id, session_id).
     */
    async upsertContentFingerprint(fingerprint: ContentFingerprint): Promise<number> {
        const res = await this.pool.query(
            `INSERT INTO content_fingerprints 
      (page_id, session_id, url, content_hash, simhash, word_count)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (page_id, session_id) DO UPDATE SET
        url = EXCLUDED.url,
        content_hash = EXCLUDED.content_hash,
        simhash = EXCLUDED.simhash,
        word_count = EXCLUDED.word_count
      RETURNING id`,
            [
                fingerprint.pageId,
                fingerprint.sessionId,
                fingerprint.url,
                fingerprint.contentHash,
                fingerprint.simhash,
                fingerprint.wordCount
            ]
        );
        return res.rows[0].id;
    }

    /**
     * Get all content fingerprints for a given session.
     */
    async getContentFingerprintsBySession(sessionId: number): Promise<ContentFingerprint[]> {
        const res = await this.pool.query(
            `SELECT page_id, session_id, url, content_hash, simhash, word_count
       FROM content_fingerprints
       WHERE session_id = $1`,
            [sessionId]
        );

        return res.rows.map(row => ({
            url: row.url,
            pageId: row.page_id,
            sessionId: row.session_id,
            contentHash: row.content_hash,
            simhash: row.simhash,
            wordCount: row.word_count
        }));
    }

    /**
     * Clear similarity index entries for a session before recomputing.
     */
    async clearSimilarityIndexForSession(sessionId: number): Promise<void> {
        await this.pool.query(
            `DELETE FROM similarity_index WHERE session_id = $1`,
            [sessionId]
        );
    }

    /**
     * Bulk insert similarity index entries for a session.
     * Uses a transaction and UPSERT semantics.
     */
    async insertSimilarityResults(results: SimilarityResult[]): Promise<void> {
        if (results.length === 0) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const r of results) {
                await client.query(
                    `INSERT INTO similarity_index 
          (source_page_id, target_page_id, session_id, similarity_score)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (source_page_id, target_page_id, session_id) DO UPDATE SET
            similarity_score = EXCLUDED.similarity_score`,
                    [r.sourcePageId, r.targetPageId, r.sessionId, r.similarityScore]
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

    /**
     * Bulk update pages with near-duplicate metrics.
     */
    async updatePagesNearDuplicateMetrics(metrics: Map<number, NearDuplicateMetrics>): Promise<void> {
        if (metrics.size === 0) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const [pageId, m] of metrics.entries()) {
                await client.query(
                    `UPDATE pages
           SET closest_duplicate_url = $2,
               closest_duplicate_similarity = $3,
               near_duplicate_count = $4
           WHERE id = $1`,
                    [
                        pageId,
                        m.closestMatch?.url || null,
                        m.closestMatch?.similarity ?? null,
                        m.nearDuplicateCount ?? 0
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

    async updatePageCarbon(pageId: number, data: { transferredBytes: number, totalTransferredBytes: number, co2Mg: number, carbonRating: string }): Promise<void> {
        await this.pool.query(
            `UPDATE pages 
             SET transferred_bytes = $2, total_transferred_bytes = $3, co2_mg = $4, carbon_rating = $5
             WHERE id = $1`,
            [pageId, this.safeInt(data.transferredBytes), this.safeInt(data.totalTransferredBytes), data.co2Mg, data.carbonRating]
        );
    }

    async getPages(sessionId?: number, limit: number = 1000, offset: number = 0): Promise<Page[]> {
        if (!sessionId) {
            // If no sessionId, use simple query
            const sql = `SELECT * FROM pages ORDER BY timestamp DESC LIMIT $1 OFFSET $2`;
            const res = await this.pool.query(sql, [limit, offset]);
            return res.rows.map(row => this.mapPage(row));
        }

        // With sessionId, include link statistics
        const sql = `
            WITH total_unique_inlinks AS (
                SELECT SUM(unique_count) as total
                FROM (
                    SELECT COUNT(DISTINCT source_page_id) as unique_count
                    FROM links
                    WHERE session_id = $1
                    GROUP BY target_page_id
                ) sub
            )
            SELECT 
                p.*,
                COALESCE(unique_in_links.count, 0) as "uniqueInlinks",
                COALESCE(unique_js_in_links.count, 0) as "uniqueJsInlinks",
                COALESCE(unique_out_links.count, 0) as "uniqueOutlinks",
                COALESCE(unique_js_out_links.count, 0) as "uniqueJsOutlinks",
                COALESCE(unique_external_out_links.count, 0) as "uniqueExternalOutlinks",
                COALESCE(unique_external_js_out_links.count, 0) as "uniqueExternalJsOutlinks",
                CASE 
                    WHEN total_unique_inlinks.total > 0 AND unique_in_links.count > 0 
                    THEN ROUND((unique_in_links.count::numeric / total_unique_inlinks.total::numeric * 100), 2)
                    ELSE 0 
                END as "percentOfTotal"
            FROM pages p
            CROSS JOIN total_unique_inlinks
            LEFT JOIN (
                SELECT target_page_id, COUNT(DISTINCT source_page_id) as count
                FROM links
                WHERE session_id = $1
                GROUP BY target_page_id
            ) unique_in_links ON p.id = unique_in_links.target_page_id
            LEFT JOIN (
                SELECT target_page_id, COUNT(DISTINCT source_page_id) as count
                FROM links
                WHERE session_id = $1 AND is_js_rendered = TRUE
                GROUP BY target_page_id
            ) unique_js_in_links ON p.id = unique_js_in_links.target_page_id
            LEFT JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = $1
                GROUP BY source_page_id
            ) unique_out_links ON p.id = unique_out_links.source_page_id
            LEFT JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = $1 AND is_js_rendered = TRUE
                GROUP BY source_page_id
            ) unique_js_out_links ON p.id = unique_js_out_links.source_page_id
            LEFT JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = $1 AND is_internal = FALSE
                GROUP BY source_page_id
            ) unique_external_out_links ON p.id = unique_external_out_links.source_page_id
            LEFT JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = $1 AND is_internal = FALSE AND is_js_rendered = TRUE
                GROUP BY source_page_id
            ) unique_external_js_out_links ON p.id = unique_external_js_out_links.source_page_id
            WHERE p.session_id = $1
            ORDER BY p.timestamp DESC 
            LIMIT $2 OFFSET $3
        `;
        const res = await this.pool.query(sql, [sessionId, limit, offset]);
        return res.rows.map(row => ({
            ...this.mapPage(row),
            uniqueInlinks: parseInt(row.uniqueInlinks) || 0,
            uniqueJsInlinks: parseInt(row.uniqueJsInlinks) || 0,
            percentOfTotal: parseFloat(row.percentOfTotal) || 0,
            uniqueOutlinks: parseInt(row.uniqueOutlinks) || 0,
            uniqueJsOutlinks: parseInt(row.uniqueJsOutlinks) || 0,
            uniqueExternalOutlinks: parseInt(row.uniqueExternalOutlinks) || 0,
            uniqueExternalJsOutlinks: parseInt(row.uniqueExternalJsOutlinks) || 0
        }));
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
          (session_id, source_page_id, source_url, target_url, target_page_id, is_internal, anchor_text, xpath, position, rel, nofollow, is_js_rendered, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
                    [
                        link.sessionId, link.sourcePageId, link.sourceUrl, link.targetUrl,
                        link.targetPageId || null, link.isInternal, link.anchorText || null,
                        link.xpath || null, link.position || null, link.rel || null,
                        link.nofollow || false, link.isJsRendered || false
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

    /**
     * Calculate and update external outlinks counts for a specific page
     * This counts unique external domain links (both regular and JS-rendered)
     */
    async updatePageExternalOutlinks(pageId: number, sessionId: number): Promise<void> {
        const sql = `
            UPDATE pages 
            SET 
                unique_external_outlinks = (
                    SELECT COUNT(DISTINCT target_url)
                    FROM links
                    WHERE source_page_id = $1 
                      AND session_id = $2 
                      AND is_internal = FALSE
                      AND (is_js_rendered IS NULL OR is_js_rendered = FALSE)
                ),
                unique_external_js_outlinks = (
                    SELECT COUNT(DISTINCT target_url)
                    FROM links
                    WHERE source_page_id = $1 
                      AND session_id = $2 
                      AND is_internal = FALSE
                      AND is_js_rendered = TRUE
                )
            WHERE id = $1
        `;
        await this.pool.query(sql, [pageId, sessionId]);
    }

    /**
     * Batch update external outlinks for all pages in a session
     * This is useful for recalculating counts after bulk link insertion
     */
    async updateAllPagesExternalOutlinks(sessionId: number): Promise<void> {
        const sql = `
            UPDATE pages p
            SET 
                unique_external_outlinks = COALESCE(external_links.count, 0),
                unique_external_js_outlinks = COALESCE(external_js_links.count, 0)
            FROM (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = $1 
                  AND is_internal = FALSE
                  AND (is_js_rendered IS NULL OR is_js_rendered = FALSE)
                GROUP BY source_page_id
            ) external_links
            FULL OUTER JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = $1 
                  AND is_internal = FALSE
                  AND is_js_rendered = TRUE
                GROUP BY source_page_id
            ) external_js_links ON external_links.source_page_id = external_js_links.source_page_id
            WHERE p.id = COALESCE(external_links.source_page_id, external_js_links.source_page_id)
              AND p.session_id = $1
        `;
        await this.pool.query(sql, [sessionId]);
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
      WITH total_unique_inlinks AS (
        SELECT SUM(unique_count) as total
        FROM (
          SELECT COUNT(DISTINCT source_page_id) as unique_count
          FROM links
          WHERE session_id = $1
          GROUP BY target_page_id
        ) sub
      )
      SELECT 
        p.id as "pageId", 
        p.url, 
        p.title,
        COALESCE(out_links.count, 0) as "outlinksCount",
        COALESCE(unique_out_links.count, 0) as "uniqueOutlinksCount",
        COALESCE(in_links.count, 0) as "inlinksCount",
        COALESCE(unique_in_links.count, 0) as "uniqueInlinksCount",
        COALESCE(unique_js_in_links.count, 0) as "uniqueJsInlinksCount",
        CASE 
          WHEN total_unique_inlinks.total > 0 AND unique_in_links.count > 0 
          THEN ROUND((unique_in_links.count::numeric / total_unique_inlinks.total::numeric * 100), 2)
          ELSE 0 
        END as "percentOfTotal"
      FROM pages p
      CROSS JOIN total_unique_inlinks
      LEFT JOIN (
        SELECT source_page_id, COUNT(*) as count
        FROM links
        WHERE session_id = $1
        GROUP BY source_page_id
      ) out_links ON p.id = out_links.source_page_id
      LEFT JOIN (
        SELECT source_page_id, COUNT(DISTINCT target_url) as count
        FROM links
        WHERE session_id = $1
        GROUP BY source_page_id
      ) unique_out_links ON p.id = unique_out_links.source_page_id
      LEFT JOIN (
        SELECT target_page_id, COUNT(*) as count
        FROM links
        WHERE session_id = $1
        GROUP BY target_page_id
      ) in_links ON p.id = in_links.target_page_id
      LEFT JOIN (
        SELECT target_page_id, COUNT(DISTINCT source_page_id) as count
        FROM links
        WHERE session_id = $1
        GROUP BY target_page_id
      ) unique_in_links ON p.id = unique_in_links.target_page_id
      LEFT JOIN (
        SELECT target_page_id, COUNT(DISTINCT source_page_id) as count
        FROM links
        WHERE session_id = $1 AND is_js_rendered = TRUE
        GROUP BY target_page_id
      ) unique_js_in_links ON p.id = unique_js_in_links.target_page_id
      WHERE p.session_id = $1
      ORDER BY "inlinksCount" DESC
      LIMIT 100
    `;
        const res = await this.pool.query(sql, [sessionId]);
        return res.rows.map(row => ({
            ...row,
            outlinksCount: parseInt(row.outlinksCount) || 0,
            uniqueOutlinksCount: parseInt(row.uniqueOutlinksCount) || 0,
            inlinksCount: parseInt(row.inlinksCount) || 0,
            uniqueInlinksCount: parseInt(row.uniqueInlinksCount) || 0,
            uniqueJsInlinksCount: parseInt(row.uniqueJsInlinksCount) || 0,
            percentOfTotal: parseFloat(row.percentOfTotal) || 0
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

    async getUniqueInlinks(pageId: number, limit: number = 100): Promise<any[]> {
        const sql = `
            SELECT DISTINCT
                l.source_page_id as "sourcePageId",
                p.url as "sourceUrl",
                p.title as "sourceTitle",
                COUNT(*) as "linkCount",
                ARRAY_AGG(DISTINCT l.anchor_text) FILTER (WHERE l.anchor_text IS NOT NULL) as "anchorTexts"
            FROM links l
            JOIN pages p ON l.source_page_id = p.id
            WHERE l.target_page_id = $1
            GROUP BY l.source_page_id, p.url, p.title
            ORDER BY "linkCount" DESC
            LIMIT $2
        `;
        const res = await this.pool.query(sql, [pageId, limit]);
        return res.rows;
    }

    async getUniqueJsInlinks(pageId: number, limit: number = 100): Promise<any[]> {
        const sql = `
            SELECT DISTINCT
                l.source_page_id as "sourcePageId",
                p.url as "sourceUrl",
                p.title as "sourceTitle",
                COUNT(*) as "linkCount",
                ARRAY_AGG(DISTINCT l.anchor_text) FILTER (WHERE l.anchor_text IS NOT NULL) as "anchorTexts"
            FROM links l
            JOIN pages p ON l.source_page_id = p.id
            WHERE l.target_page_id = $1 AND l.is_js_rendered = TRUE
            GROUP BY l.source_page_id, p.url, p.title
            ORDER BY "linkCount" DESC
            LIMIT $2
        `;
        const res = await this.pool.query(sql, [pageId, limit]);
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

    async updatePageLinkScore(pageId: number, linkScore: number): Promise<void> {
        await this.pool.query(
            `UPDATE pages SET link_score = $2 WHERE id = $1`,
            [pageId, linkScore]
        );
    }

    async updatePageLinkScores(scores: Map<number, number>): Promise<void> {
        if (scores.size === 0) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const [pageId, score] of scores.entries()) {
                await client.query(
                    `UPDATE pages SET link_score = $2 WHERE id = $1`,
                    [pageId, score]
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

    async getPageLinkData(sessionId: number): Promise<any[]> {
        const sql = `
            SELECT 
                p.id as "pageId",
                p.url,
                p.crawl_depth as "crawlDepth",
                p.link_score as "currentLinkScore",
                COALESCE(
                    json_agg(
                        json_build_object(
                            'sourcePageId', l.source_page_id,
                            'targetPageId', l.target_page_id,
                            'position', l.position,
                            'sourcePageScore', sp.link_score,
                            'sourceCrawlDepth', sp.crawl_depth
                        )
                    ) FILTER (WHERE l.id IS NOT NULL),
                    '[]'
                ) as "inlinks"
            FROM pages p
            LEFT JOIN links l ON l.target_page_id = p.id AND l.session_id = $1 AND l.is_internal = TRUE
            LEFT JOIN pages sp ON l.source_page_id = sp.id
            WHERE p.session_id = $1
            GROUP BY p.id, p.url, p.crawl_depth, p.link_score
        `;
        const res = await this.pool.query(sql, [sessionId]);
        return res.rows.map(row => ({
            pageId: row.pageId,
            url: row.url,
            crawlDepth: row.crawlDepth || 0,
            currentLinkScore: row.currentLinkScore,
            inlinks: row.inlinks
        }));
    }

    async getLinkScoreStats(sessionId: number): Promise<any> {
        const sql = `
            SELECT 
                COUNT(*) FILTER (WHERE link_score >= 80) as "excellentCount",
                COUNT(*) FILTER (WHERE link_score >= 60 AND link_score < 80) as "goodCount",
                COUNT(*) FILTER (WHERE link_score >= 40 AND link_score < 60) as "fairCount",
                COUNT(*) FILTER (WHERE link_score >= 20 AND link_score < 40) as "weakCount",
                COUNT(*) FILTER (WHERE link_score < 20 AND link_score IS NOT NULL) as "veryWeakCount",
                COUNT(*) FILTER (WHERE link_score IS NULL) as "notCalculatedCount",
                ROUND(AVG(link_score)::numeric, 2) as "averageLinkScore",
                MAX(link_score) as "maxLinkScore",
                MIN(link_score) as "minLinkScore"
            FROM pages
            WHERE session_id = $1
        `;
        const res = await this.pool.query(sql, [sessionId]);
        return res.rows[0];
    }

    async getPagesWithLinkScores(sessionId: number, limit: number, offset: number, sortField: string = 'link_score', sortOrder: string = 'DESC'): Promise<any[]> {
        const validSortFields = ['link_score', 'url', 'title', 'crawl_depth'];
        const dbSortField = validSortFields.includes(sortField) ? sortField : 'link_score';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const sql = `
            SELECT 
                id as "pageId",
                url,
                title,
                crawl_depth as "crawlDepth",
                link_score as "linkScore",
                (SELECT COUNT(*) FROM links WHERE target_page_id = pages.id AND is_internal = TRUE) as "inlinkCount"
            FROM pages
            WHERE session_id = $1 AND link_score IS NOT NULL
            ORDER BY ${dbSortField} ${order} NULLS LAST
            LIMIT $2 OFFSET $3
        `;

        const res = await this.pool.query(sql, [sessionId, limit, offset]);
        return res.rows;
    }

    async countPagesWithLinkScores(sessionId: number): Promise<number> {
        const sql = `SELECT COUNT(*) FROM pages WHERE session_id = $1 AND link_score IS NOT NULL`;
        const res = await this.pool.query(sql, [sessionId]);
        return parseInt(res.rows[0].count);
    }

    async getLinkScoreDistribution(sessionId: number): Promise<any[]> {
        const sql = `
            SELECT 
                CASE 
                    WHEN link_score >= 80 THEN 'Excellent (80-100)'
                    WHEN link_score >= 60 THEN 'Good (60-79)'
                    WHEN link_score >= 40 THEN 'Fair (40-59)'
                    WHEN link_score >= 20 THEN 'Weak (20-39)'
                    ELSE 'Very Weak (0-19)'
                END as category,
                COUNT(*) as count
            FROM pages
            WHERE session_id = $1 AND link_score IS NOT NULL
            GROUP BY category
            ORDER BY MIN(link_score) DESC
        `;
        const res = await this.pool.query(sql, [sessionId]);
        return res.rows;
    }

    async getPageWithLinkScore(pageId: number): Promise<any | null> {
        const sql = `
            SELECT 
                id as "pageId",
                session_id as "sessionId",
                url,
                title,
                crawl_depth as "crawlDepth",
                link_score as "linkScore"
            FROM pages
            WHERE id = $1
        `;
        const res = await this.pool.query(sql, [pageId]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    async getTopPagesByLinkScore(sessionId: number, limit: number): Promise<any[]> {
        const sql = `
            SELECT 
                id as "pageId",
                url,
                title,
                crawl_depth as "crawlDepth",
                link_score as "linkScore",
                (SELECT COUNT(*) FROM links WHERE target_page_id = pages.id AND is_internal = TRUE) as "inlinkCount"
            FROM pages
            WHERE session_id = $1 AND link_score IS NOT NULL
            ORDER BY link_score DESC
            LIMIT $2
        `;
        const res = await this.pool.query(sql, [sessionId, limit]);
        return res.rows;
    }

    async getBottomPagesByLinkScore(sessionId: number, limit: number): Promise<any[]> {
        const sql = `
            SELECT 
                id as "pageId",
                url,
                title,
                crawl_depth as "crawlDepth",
                link_score as "linkScore",
                (SELECT COUNT(*) FROM links WHERE target_page_id = pages.id AND is_internal = TRUE) as "inlinkCount"
            FROM pages
            WHERE session_id = $1 AND link_score IS NOT NULL
            ORDER BY link_score ASC
            LIMIT $2
        `;
        const res = await this.pool.query(sql, [sessionId, limit]);
        return res.rows;
    }

    private mapPage(row: any): Page {
        return {
            id: row.id,
            sessionId: row.session_id,
            url: row.url,
            title: row.title,
            titleLength: row.title_length,
            titlePixelWidth: row.title_pixel_width,
            description: row.description,
            descriptionLength: row.description_length,
            descriptionPixelWidth: row.description_pixel_width,
            contentType: row.content_type,
            lastModified: row.last_modified,
            statusCode: row.status_code,
            responseTime: row.response_time,
            wordCount: row.word_count,
            sentenceCount: row.sentence_count,
            averageWordsPerSentence: row.average_words_per_sentence ? parseFloat(row.average_words_per_sentence) : undefined,
            fleschReadingEase: row.flesch_reading_ease_score ? parseFloat(row.flesch_reading_ease_score) : undefined,
            readabilityLevel: row.readability_level && row.readability_level.trim().length > 0 ? row.readability_level.trim() : undefined,
            textToHtmlRatio: row.text_to_html_ratio !== null && row.text_to_html_ratio !== undefined ? parseFloat(row.text_to_html_ratio) : undefined,
            crawlDepth: row.crawl_depth !== null && row.crawl_depth !== undefined ? parseInt(row.crawl_depth) : undefined,
            folderDepth: row.folder_depth !== null && row.folder_depth !== undefined ? parseInt(row.folder_depth) : undefined,
            sizeBytes: row.size_bytes,
            timestamp: row.timestamp,
            success: row.success,
            errorMessage: row.error_message,
            indexable: row.indexable,
            indexabilityStatus: row.indexability_status,
            metaKeywords: row.meta_keywords,
            metaKeywordsLength: row.meta_keywords_length,
            metaRobots: row.meta_robots,
            xRobotsTag: row.x_robots_tag,
            metaRefresh: row.meta_refresh,
            canonicalUrl: row.canonical_url,
            relNext: row.rel_next,
            relPrev: row.rel_prev,
            httpRelNext: row.http_rel_next,
            httpRelPrev: row.http_rel_prev,
            amphtmlUrl: row.amphtml_url,
            transferredBytes: row.transferred_bytes ? parseInt(row.transferred_bytes) : undefined,
            totalTransferredBytes: row.total_transferred_bytes ? parseInt(row.total_transferred_bytes) : undefined,
            co2Mg: row.co2_mg ? parseFloat(row.co2_mg) : undefined,
            carbonRating: row.carbon_rating,
            headingTags: row.heading_tags,
            linkScore: row.link_score ? parseFloat(row.link_score) : undefined,
            closestDuplicateUrl: row.closest_duplicate_url || undefined,
            closestDuplicateSimilarity: row.closest_duplicate_similarity !== null && row.closest_duplicate_similarity !== undefined
                ? parseFloat(row.closest_duplicate_similarity)
                : undefined,
            nearDuplicateCount: row.near_duplicate_count !== null && row.near_duplicate_count !== undefined
                ? parseInt(row.near_duplicate_count)
                : undefined
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
