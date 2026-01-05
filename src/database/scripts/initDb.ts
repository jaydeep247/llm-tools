import { query, getPool } from '../dbConnection.js';
import { userSchema } from '../tables/userSchema.js';
import { crawlSchema } from '../tables/crawlSchema.js';
import { pageSchema } from '../tables/pageSchema.js';
import { aeoSchema } from '../tables/aeoSchema.js';
import { auditSchema } from '../tables/auditSchema.js';

async function initializeDatabase() {
    console.log('🚀 Starting Database Initialization...');
    console.log('📍 Current directory:', process.cwd());
    console.log('📍 Script location:', import.meta.url);

    const schemas = [
        { name: 'Users', sql: userSchema },
        { name: 'Crawls', sql: crawlSchema },
        { name: 'Pages', sql: pageSchema },
        { name: 'Audits', sql: auditSchema },
        { name: 'AEO', sql: aeoSchema }
    ];

    try {
        console.log(`\n📋 Will initialize ${schemas.length} schema groups...\n`);

        for (const schema of schemas) {
            console.log(`⏳ Initializing ${schema.name} tables...`);
            try {
                await query(schema.sql);
                console.log(`✅ ${schema.name} tables ready.`);
            } catch (schemaErr) {
                console.error(`❌ Failed to initialize ${schema.name} tables`);
                if (schemaErr instanceof Error) {
                    console.error(`   Error: ${schemaErr.message}`);
                }
                throw schemaErr;
            }
        }

        console.log('\n✨ Database Initialization Complete! ✨');
        console.log('🎉 All tables have been created successfully.\n');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Database Initialization Failed!');
        if (err instanceof Error) {
            console.error('📝 Error Message:', err.message);
            console.error('📝 Error Stack:', err.stack);
        } else {
            console.error('📝 Unknown error:', err);
        }
        process.exit(1);
    } finally {
        console.log('🔌 Closing database connection...');
        const pool = getPool();
        await pool.end();
        console.log('✅ Connection closed.');
    }
}

// Run the initialization with top-level error handling
initializeDatabase().catch(err => {
    console.error('💥 Unhandled error in initialization:');
    console.error(err);
    process.exit(1);
});
