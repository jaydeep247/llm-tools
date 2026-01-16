import { databaseInitializer } from '../src/config/DatabaseInitializer.js';
import { getPool } from '../src/config/dbConnection.js';

async function initializeDatabase() {
    console.log('🚀 Starting Database Initialization...');
    
    try {
        await databaseInitializer.initialize();
        console.log('✨ Database Initialization Complete! ✨');
        process.exit(0);
    } catch (err) {
        console.error('❌ Database Initialization Failed!');
        if (err instanceof Error) {
            console.error('📝 Error Message:', err.message);
            console.error('📝 Error Stack:', err.stack);
        }
        process.exit(1);
    } finally {
        const pool = getPool();
        await pool.end();
    }
}

// Run the initialization
initializeDatabase();

