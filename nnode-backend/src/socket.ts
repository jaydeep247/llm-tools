import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from './config/env';

let io: Server | null = null;

export const initSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  io.on('connection', (socket: Socket) => {
    // Client joins a job room
    socket.on('join-job', (jobId: string) => {
      if (!jobId) return;
      
      socket.join(`job:${jobId}`);
    });

    socket.on('leave-job', (jobId: string) => {
      socket.leave(`job:${jobId}`);
    });

    socket.on('disconnect', () => {
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
