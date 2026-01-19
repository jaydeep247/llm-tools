/**
 * Backfill Script for Title and Meta Description Detection
 * Calculates and populates title and meta description detection fields
 * for all existing pages in the database
 */

import { getPool } from '../src/config/dbConnection.js';
import { PageRepository } from '../src/models/repositories/pageRepository.js';
import { Logger } from '../src/helpers/logging/Logger.js';

const logger = Logger.getInstance();

async function backfillTitleDetection() {
    const pool = getPool();
    const pageRepo = new PageRepository(pool);

    try {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 Starting Title and Meta Description Detection Backfill');
        console.log('='.repeat(60));

        // Get all unique session IDs
        const sessionsResult = await pool.query(
            `SELECT DISTINCT session_id FROM pages ORDER BY session_id`
        );

        const sessionIds = sessionsResult.rows.map(row => row.session_id);
        console.log(`📊 Found ${sessionIds.length} sessions to process\n`);

        let totalPagesProcessed = 0;
        let totalSessionsProcessed = 0;

        for (const sessionId of sessionIds) {
            try {
                // Get page count for this session
                const pageCountResult = await pool.query(
                    `SELECT COUNT(*) as count FROM pages WHERE session_id = $1`,
                    [sessionId]
                );
                const pageCount = parseInt(pageCountResult.rows[0].count);

                if (pageCount === 0) {
                    console.log(`⏭️  Session ${sessionId}: No pages, skipping`);
                    continue;
                }

                console.log(`📝 Processing session ${sessionId} (${pageCount} pages)...`);

                // Batch update title and meta description detection for this session
                await pageRepo.batchUpdateAllDetections(sessionId);

                totalPagesProcessed += pageCount;
                totalSessionsProcessed++;

                console.log(`✅ Session ${sessionId}: Processed ${pageCount} pages`);
            } catch (error: any) {
                console.error(`❌ Session ${sessionId}: Failed - ${error.message}`);
                logger.error(`Failed to process session ${sessionId}`, error as Error);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 Backfill Summary');
        console.log('='.repeat(60));
        console.log(`✅ Sessions processed: ${totalSessionsProcessed}`);
        console.log(`✅ Pages processed: ${totalPagesProcessed}`);
        console.log('='.repeat(60) + '\n');

        logger.info(`Title and meta description detection backfill complete: ${totalPagesProcessed} pages across ${totalSessionsProcessed} sessions`);

    } catch (error) {
        logger.error('Title detection backfill failed', error as Error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run if executed directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('backfillTitleDetection')) {
    backfillTitleDetection()
        .then(() => {
            console.log('✅ Backfill completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Backfill failed:', error);
            process.exit(1);
        });
}

export { backfillTitleDetection };
