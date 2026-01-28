import { Response } from 'express';
import { Logger } from '../helpers/logging/Logger.js';

const logger = Logger.getInstance();

type Client = {
    id: number;
    res: Response;
    userId: number;
};

let nextClientId = 1;
const clients: Client[] = [];

/**
 * Send Server-Sent Events to connected clients
 * @param data - Data to send
 * @param event - Event type
 * @param userId - Optional user ID to send to specific user only
 */
export function sendEvent(data: unknown, event: string = 'message', userId?: number): void {
    const jsonString = JSON.stringify(data);
    const payload = `event: ${event}\ndata: ${jsonString}\n\n`;
    console.log('sendEvent data:', data);
    console.log('sendEvent userId:', userId);

    // If userId is specified, only send to that user's clients
    const targetClients = userId
        ? clients.filter(c => c.userId === userId)
        : clients; // Fallback to broadcast if no userId (for backwards compatibility)

    for (const c of targetClients) {
        try {
            c.res.write(payload);
        } catch (error) {
            console.error('Failed to write to client:', error);
        }
    }
}

/**
 * Register a new SSE client
 * @param res - Express Response object
 * @param userId - User ID
 * @returns Client ID
 */
export function registerClient(res: Response, userId: number): number {
    const id = nextClientId++;
    clients.push({ id, res, userId });
    logger.info(`SSE client connected: ${id} for user ${userId}`);
    return id;
}

/**
 * Unregister an SSE client
 * @param clientId - Client ID to remove
 */
export function unregisterClient(clientId: number): void {
    const idx = clients.findIndex(c => c.id === clientId);
    if (idx !== -1) {
        clients.splice(idx, 1);
        logger.info(`SSE client disconnected: ${clientId}`);
    }
}

/**
 * Get all connected clients
 * @returns Array of clients
 */
export function getClients(): Client[] {
    return clients;
}

/**
 * Close all SSE connections (for graceful shutdown)
 */
export function closeAllConnections(): void {
    logger.info('Closing all SSE client connections...');
    for (const client of clients) {
        try {
            client.res.end();
        } catch (err) {
            logger.error('Error closing SSE client', err as Error);
        }
    }
    clients.length = 0; // Clear the clients array
    logger.info('All SSE connections closed');
}
