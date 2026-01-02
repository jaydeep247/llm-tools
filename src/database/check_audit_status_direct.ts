
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'contentlytics'
});

async function checkStatus() {
    try {
        // Get latest session
        const res = await pool.query('SELECT * FROM crawl_sessions ORDER BY id DESC LIMIT 1');
        if (res.rows.length === 0) {
            console.log('No sessions found.');
            return;
        }
        const session = res.rows[0];

        // Get page count
        const pageRes = await pool.query('SELECT COUNT(*) FROM pages WHERE session_id = $1', [session.id]);
        const totalPages = parseInt(pageRes.rows[0].count);

        // Get audit count
        const auditRes = await pool.query('SELECT COUNT(*) FROM audit_results WHERE session_id = $1', [session.id]);
        const completedAudits = parseInt(auditRes.rows[0].count);

        console.log(JSON.stringify({
            sessionId: session.id,
            status: session.status,
            url: session.start_url || session.url,
            totalPages,
            completedAudits,
            isComplete: session.status === 'completed' || (totalPages > 0 && completedAudits >= totalPages)
        }, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkStatus();
