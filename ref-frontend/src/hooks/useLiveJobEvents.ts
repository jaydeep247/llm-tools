import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { addLog, addLink, updateStatus, setConnectionStatus, markCompleted } from '../store/slices/liveJobSlice';

export interface JobEvent {
  jobId: string;
  eventType: string;
  payload: any;
  timestamp: number;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

export const useLiveJobEvents = (jobId: string | null) => {
  const dispatch = useAppDispatch();
  const socketRef = useRef<Socket | null>(null);
  
  // We use a ref for lastEventTimestamp to avoid reconnecting when it changes
  // However, we might want to use it for filtering if needed.
  // For now, we just process all incoming events as they are "live".

  useEffect(() => {
    if (!jobId) {
      dispatch(setConnectionStatus(false));
      return;
    }

    // Initialize Socket.IO connection
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      dispatch(setConnectionStatus(true));
      socket.emit('join-job', jobId);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      dispatch(setConnectionStatus(false));
    });

    // Handle live events
    const handleEvent = (event: JobEvent) => {
      
      switch (event.eventType) {
        case 'log':
          dispatch(addLog(event.payload));
          break;
        case 'link_found':
          dispatch(addLink(event.payload));
          break;
        case 'status':
        case 'JOB_STARTED':
          dispatch(updateStatus(event.payload?.status || event.eventType));
          break;
        case 'JOB_COMPLETED':
        case 'JOB_FAILED':
          dispatch(updateStatus(event.payload?.status || event.eventType));
          dispatch(markCompleted());
          break;
        default:
          break;
      }
    };

    socket.on('job:event', handleEvent);

    // Handle batched events
    socket.on('job:batch', (batchEvents: JobEvent[]) => {
      batchEvents.forEach(handleEvent);
    });

    socket.on('disconnect', () => {
      dispatch(setConnectionStatus(false));
    });

    // Cleanup
    return () => {
      if (socket.connected) {
        socket.emit('leave-job', jobId);
        socket.disconnect();
      }
      socketRef.current = null;
      dispatch(setConnectionStatus(false));
    };
  }, [jobId, dispatch]);
};
