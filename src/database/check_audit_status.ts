import { getPool } from './dbConnection.js';

async function checkStatus() {
    const pool = getPool();
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
            url: session.start_url,
            totalPages,
            completedAudits,
            isComplete: session.status === 'completed' || completedAudits >= totalPages
        }, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

checkStatus();
