import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { logger } from './shared/logger/logger';
import { env } from './config/env';

let io: Server | null = null;

export const initSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Client joins a job room
    socket.on('join-job', (jobId: string) => {
      if (!jobId) return;
      
      logger.info(`Socket ${socket.id} joining job room: ${jobId}`);
      socket.join(`job:${jobId}`);
    });

    socket.on('leave-job', (jobId: string) => {
      logger.info(`Socket ${socket.id} leaving job room: ${jobId}`);
      socket.leave(`job:${jobId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIo = (): Server => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};
