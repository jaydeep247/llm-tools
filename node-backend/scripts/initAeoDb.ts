import { databaseInitializer } from '../src/config/DatabaseInitializer.js';
import { getPool } from '../src/config/dbConnection.js';

async function initializeAeoDatabase() {
    console.log('🚀 Starting AEO Database Initialization...');

    try {
        // Use the main database initializer which includes AEO tables
        await databaseInitializer.initialize();
        console.log('✨ AEO Database Initialization Complete! ✨');
        process.exit(0);
    } catch (err) {
        console.error('❌ AEO Database Initialization Failed!');
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
