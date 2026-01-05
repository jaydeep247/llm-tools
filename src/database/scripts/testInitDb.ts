import { query, getPool } from './dbConnection.js';
import { userSchema } from '../tables/userSchema.js';
import { crawlSchema } from '../tables/crawlSchema.js';
import { pageSchema } from '../tables/pageSchema.js';
import { auditSchema } from '../tables/auditSchema.js';

async function initializeDatabase() {
    console.log('🚀 Starting Database Initialization...');

    const schemas = [
        { name: 'Users', sql: userSchema },
        { name: 'Crawls', sql: crawlSchema },
        { name: 'Pages', sql: pageSchema },
        { name: 'Audits', sql: auditSchema }
    ];

    try {
        for (const schema of schemas) {
            console.log(`⏳ Initializing ${schema.name} tables...`);
            await query(schema.sql);
            console.log(`✅ ${schema.name} tables ready.`);
        }

        console.log('\n✨ Database Initialization Complete! ✨');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Database Initialization Failed!');
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
initializeDatabase().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
