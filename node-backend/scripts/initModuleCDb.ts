import { databaseInitializer } from '../src/config/DatabaseInitializer.js';
import { getPool } from '../src/config/dbConnection.js';

async function initModuleC() {
    console.log('🚀 Initializing Module C Database Tables...');

    try {
        // Use the main database initializer which includes Module C tables
        await databaseInitializer.initialize();
        console.log('✅ Module C tables initialized successfully.');
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