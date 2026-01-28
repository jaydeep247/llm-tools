/**
 * Server Lifecycle Management
 * Handles server initialization, startup, and graceful shutdown
 */

import express from 'express';
import { Server } from 'http';
import { Logger } from '../helpers/logging/Logger.js';
import { databaseInitializer } from '../config/DatabaseInitializer.js';
import { runCrawlerTableMigrations } from '../config/CrawlerTableMigrations.js';
import { initializeSchedulerService } from './scheduler/index.js';
import { AuditIntegration } from './module_A/audits/AuditIntegration.js';
import { closeAllConnections } from './SSEService.js';

const logger = Logger.getInstance();

interface ServerState {
    serverInitializationComplete: boolean;
    isShuttingDown: boolean;
    initStartTime: number;
}

const state: ServerState = {
    serverInitializationComplete: false,
    isShuttingDown: false,
    initStartTime: Date.now()
};

let schedulerService: ReturnType<typeof initializeSchedulerService> | null = null;
let serverInstance: Server | null = null;

/**
 * Initialize database
 */
export async function initializeDatabase(): Promise<void> {
    console.log('[INIT DEBUG] Initializing database...');
    await databaseInitializer.initialize().catch((error) => {
        console.error('[INIT DEBUG] Database initialization failed:', error);
        logger.error('Failed to initialize database', error as Error);
        process.exit(1);
    });
    console.log('[INIT DEBUG] Database initialization complete');
    
    // Run crawler table migrations to ensure all columns exist
    console.log('[INIT DEBUG] Running crawler table migrations...');
    try {
        await runCrawlerTableMigrations();
        console.log('[INIT DEBUG] Crawler table migrations complete');
    } catch (error) {
        console.error('[INIT DEBUG] Crawler table migrations failed:', error);
        logger.error('Failed to run crawler table migrations', error as Error);
        process.exit(1);
    }
}

/**
 * Start the HTTP server
 */
export function startServer(app: express.Application, port: number): Server {
    console.log('[INIT DEBUG] Server initialization starting...');
    
    const server = app.listen(port, () => {
        const initDuration = Date.now() - state.initStartTime;
        console.log(`[INIT DEBUG] Server listening callback triggered after ${initDuration}ms`);
        logger.info(`Server started`, { port, environment: process.env.NODE_ENV || 'development' });
        console.log(`Server listening on http://localhost:${port}`);
        console.log(`Health check: http://localhost:${port}/api/health`);
        console.log(`Metrics: http://localhost:${port}/api/metrics`);
        console.log(`Logs: http://localhost:${port}/api/logs`);

        // Start scheduler service
        console.log('[INIT DEBUG] Starting scheduler service...');
        schedulerService = initializeSchedulerService({
            checkIntervalMs: 60000, // Check every minute
            maxConcurrentRuns: 3,
            retryFailedSchedules: true,
            retryDelayMs: 300000 // 5 minutes
        });
        schedulerService.start();
        console.log('[INIT DEBUG] Scheduler service started');

        // Start audit integration
        console.log('[INIT DEBUG] Starting audit integration...');
        const auditIntegration = new AuditIntegration();
        auditIntegration.start();
        console.log('[INIT DEBUG] Audit integration started');

        // Mark initialization as complete AFTER all services are started
        state.serverInitializationComplete = true;
        const totalInitTime = Date.now() - state.initStartTime;
        console.log(`[INIT DEBUG] ✅ Server initialization COMPLETE (${totalInitTime}ms)`);
        logger.info('Server initialization complete - ready to accept requests', { duration: `${totalInitTime}ms` });
    });

    // Error handling
    server.on('error', (error) => {
        if ((error as any).code === 'EADDRINUSE') {
            logger.error(`Port ${port} is already in use`, error as Error);
            console.error(`Error: Port ${port} is already in use. Please free the port or change PORT environment variable.`);
            process.exit(1);
        } else {
            logger.error('Server error', error as Error);
            console.error('Server error:', error);
        }
    });

    serverInstance = server;
    return server;
}

/**
 * Handle graceful shutdown
 */
function handleShutdown(signal: string): void {
    console.log(`[SHUTDOWN DEBUG] ${signal} received. InitComplete: ${state.serverInitializationComplete}, Shutting down: ${state.isShuttingDown}`);

    // Prevent multiple shutdown attempts
    if (state.isShuttingDown) {
        console.log(`[SHUTDOWN DEBUG] Already shutting down, ignoring ${signal}`);
        return;
    }

    // Prevent shutdown during initialization
    if (!state.serverInitializationComplete) {
        console.log(`[SHUTDOWN DEBUG] Initialization not complete yet, ignoring ${signal} (likely from child process)`);
        logger.warn(`${signal} received during initialization - ignored (child process signal)`);
        return;
    }

    state.isShuttingDown = true;
    console.log('[SHUTDOWN DEBUG] Starting graceful shutdown sequence...');
    logger.info(`Graceful shutdown initiated via ${signal}`);

    // Stop scheduler service
    if (schedulerService) {
        console.log('[SHUTDOWN DEBUG] Stopping scheduler service...');
        schedulerService.stop();
    }

    // Close all SSE client connections
    console.log('[SHUTDOWN DEBUG] Closing all SSE client connections...');
    closeAllConnections();

    // Close HTTP server
    if (serverInstance) {
        console.log('[SHUTDOWN DEBUG] Closing HTTP server...');
        serverInstance.close(() => {
            console.log('[SHUTDOWN DEBUG] ✅ HTTP server closed');
            logger.info('HTTP server closed gracefully');
            console.log('[SHUTDOWN DEBUG] Exiting process...');
            process.exit(0);
        });
    }

    // Force exit after 15 seconds if graceful shutdown doesn't work
    const shutdownTimeout = setTimeout(() => {
        console.error('[SHUTDOWN DEBUG] Graceful shutdown timeout, forcing exit...');
        logger.error('Graceful shutdown timeout - forcing process exit');
        console.log('[SHUTDOWN DEBUG] Active connections still open, destroying them...');
        process.exit(1);
    }, 15000);

    // Make timeout unreferable so it doesn't keep process alive
    shutdownTimeout.unref();
}

/**
 * Setup process event handlers for graceful shutdown and error handling
 */
export function setupProcessHandlers(): void {
    // Listen for unexpected process exits from child processes
    process.on('exit', (code) => {
        console.log(`[DEBUG] Process exit event fired with code: ${code}, serverInitComplete: ${state.serverInitializationComplete}, isShuttingDown: ${state.isShuttingDown}`);
    });

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    // Log any uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('[ERROR DEBUG] Uncaught exception:', error);
        logger.error('Uncaught exception', error);
        if (!state.isShuttingDown) {
            state.isShuttingDown = true;
            process.exit(1);
        }
    });

    // Log any unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('[ERROR DEBUG] Unhandled rejection:', reason, 'Promise:', promise);
        logger.error('Unhandled promise rejection', new Error(String(reason)));
    });
}
