import { query, getPool } from './dbConnection.js';

async function checkTables() {
    try {
        console.log('Checking for existing tables...\n');

        const result = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);

        console.log('Found tables:', result.rows.map(r => r.table_name).join(', '));
        console.log('\nTotal tables:', result.rows.length);

        // Check specifically for the missing tables
        const tableNames = result.rows.map(r => r.table_name);
        const requiredTables = ['crawl_schedules', 'audit_schedules', 'users', 'crawl_sessions', 'audit_results'];

        console.log('\nRequired tables status:');
        for (const table of requiredTables) {
            const exists = tableNames.includes(table);
            console.log(`  ${table}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        const pool = getPool();
        await pool.end();
    }
}

checkTables();
