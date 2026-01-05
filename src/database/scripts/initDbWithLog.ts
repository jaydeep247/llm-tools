import { query, getPool } from './dbConnection.js';
import { userSchema } from '../tables/userSchema.js';
import { crawlSchema } from '../tables/crawlSchema.js';
import { pageSchema } from '../tables/pageSchema.js';
import { auditSchema } from '../tables/auditSchema.js';
import fs from 'fs';
import path from 'path';

const logFile = path.join(process.cwd(), 'db-init-log.txt');

function log(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(logFile, logMessage);
}

async function initializeDatabase() {
    // Clear previous log
    if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
    }

    log('🚀 Starting Database Initialization...');

    const schemas = [
        { name: 'Users', sql: userSchema },
        { name: 'Crawls', sql: crawlSchema },
        { name: 'Pages', sql: pageSchema },
        { name: 'Audits', sql: auditSchema }
    ];

    try {
        for (const schema of schemas) {
            log(`⏳ Initializing ${schema.name} tables...`);
            await query(schema.sql);
            log(`✅ ${schema.name} tables ready.`);
        }

        log('\n✨ Database Initialization Complete! ✨');
        log(`Log file saved to: ${logFile}`);
        process.exit(0);
    } catch (err) {
        log('\n❌ Database Initialization Failed!');
        if (err instanceof Error) {
            log(`📝 Error Message: ${err.message}`);
            log(`📝 Error Stack: ${err.stack}`);
        }
        process.exit(1);
    } finally {
        const pool = getPool();
        await pool.end();
    }
}

// Run the initialization
initializeDatabase().catch(err => {
    log(`Unhandled error: ${err}`);
    process.exit(1);
});
