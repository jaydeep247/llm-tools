import { query, getPool } from '../dbConnection.js';
import { aeoMetricsSchema } from '../tables/aeoMetricsSchema.js';

async function initModuleC() {
    console.log('🚀 Initializing Module C Database Tables...');

    try {
        console.log('⏳ Creating aeo_module_c_metrics table...');
        await query(aeoMetricsSchema);
        console.log('✅ Module C tables created successfully.');

        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to initialize Module C tables:', err);
        process.exit(1);
    } finally {
        const pool = getPool();
        await pool.end();
    }
}

initModuleC();