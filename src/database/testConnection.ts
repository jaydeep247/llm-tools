import { query, getPool } from './dbConnection.js';

async function testConnection() {
    console.log('🔄 Testing PostgreSQL connection...');
    try {
        const start = Date.now();
        const res = await query('SELECT NOW() as current_time, current_database() as db_name');
        const duration = Date.now() - start;

        console.log('✅ Connection Successful!');
        console.log('📍 Current Time:', res.rows[0].current_time);
        console.log('📂 Database Name:', res.rows[0].db_name);
        console.log('⏱️  Response Time:', duration + 'ms');

        await getPool().end();
    } catch (err) {
        console.error('❌ Connection Failed!');
        if (err instanceof Error) {
            console.error('📝 Error Message:', err.message);
            console.error('🔍 Detail:', (err as any).detail || 'No extra details');
        }
        process.exit(1);
    }
}

testConnection();
