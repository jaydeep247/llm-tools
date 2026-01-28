/**
 * Audit Worker Entry Point
 * Runs the Redis-based audit worker for parallel processing
 */

import { main } from '../redis/audit/audit-worker.js';

// Run the worker
main().catch((e) => {
    console.error('[audit-worker] Fatal error:', e);
    process.exit(1);
});