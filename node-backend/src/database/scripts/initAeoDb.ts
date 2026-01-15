import { query, getPool } from '../dbConnection.js';
import { aeoSchema } from '../tables/aeoSchema.js';

async function initializeAeoDatabase() {
    console.log('🚀 Starting AEO Database Initialization...');

    try {
        console.log('⏳ Initializing AEO Results table...');
        await query(aeoSchema);

        // Migration: Add score_consistency if missing
        try {
            await query(`ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS score_consistency INTEGER DEFAULT 0;`);
            await query(`ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS score_entity_coverage INTEGER DEFAULT 0;`);
            await query(`ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS entities_expected JSONB DEFAULT '[]';`);
            await query(`ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS entities_observed JSONB DEFAULT '[]';`);
            await query(`ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS entities_missing JSONB DEFAULT '[]';`);
            await query(`ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS brand_metrics JSONB DEFAULT NULL;`);
            console.log('✅ Schema migration applied (consistency, entity coverage, brand metrics).');
        } catch (e) {
            console.log('ℹ️ Schema migration note: ' + (e as Error).message);
        }

        console.log('✅ AEO Results table ready.');

        console.log('\n✨ AEO Database Initialization Complete! ✨');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ AEO Database Initialization Failed!');
        if (err instanceof Error) {
            console.error('📝 Error Message:', err.message);
        }
        process.exit(1);
    } finally {
        const pool = getPool();
        await pool.end();
    }
}

// Run the initialization
initializeAeoDatabase();
