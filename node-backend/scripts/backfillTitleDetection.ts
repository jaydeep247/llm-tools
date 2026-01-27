/**
 * Backfill Script for Title and Meta Description Detection
 * Calculates and populates title and meta description detection fields
 * for all existing pages in the database
 */

import { prisma } from '../src/config/prismaClient.js';
import { PageRepository } from '../src/models/repositories/pageRepository.js';
import { Logger } from '../src/helpers/logging/Logger.js';

const logger = Logger.getInstance();

async function backfillTitleDetection() {
    const pageRepo = new PageRepository();

    try {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 Starting Title and Meta Description Detection Backfill');
        console.log('='.repeat(60));

        // Get all unique session IDs from pages table
        const sessionsResult = await prisma.page.findMany({
            distinct: ['sessionId'],
            select: { sessionId: true },
            orderBy: { sessionId: 'asc' }
        });

        const sessionIds = sessionsResult
            .map(row => row.sessionId)
            .filter((id): id is number => id !== null && id !== undefined);
        console.log(`📊 Found ${sessionIds.length} sessions to process\n`);

        let totalPagesProcessed = 0;
        let totalSessionsProcessed = 0;

        for (const sessionId of sessionIds) {
            try {
                // Get page count for this session
                const pageCount = await prisma.page.count({
                    where: { sessionId }
                });

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
        await prisma.$disconnect();
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
