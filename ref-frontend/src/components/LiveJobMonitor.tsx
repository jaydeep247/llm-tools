'use client';

import React, { useEffect, useRef } from 'react';
import { useLiveJobEvents } from '../hooks/useLiveJobEvents';

interface LiveJobMonitorProps {
  jobId: string;
}

export const LiveJobMonitor: React.FC<LiveJobMonitorProps> = ({ jobId }) => {
  const { events, status, connected } = useLiveJobEvents(jobId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="p-4 border rounded shadow-md bg-white dark:bg-gray-800 max-w-2xl mx-auto my-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Job Monitor</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
             <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
             <span className="text-xs text-gray-600">{connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>
      
      <div className="mb-4 text-sm text-gray-500">Job ID: {jobId}</div>

      <div className="mb-4">
        <span className="font-semibold mr-2">Status:</span>
        <span className={`px-2 py-1 rounded text-sm font-medium ${
          status === 'completed' || status === 'JOB_COMPLETED' ? 'bg-green-100 text-green-800' :
          status === 'failed' || status === 'JOB_FAILED' ? 'bg-red-100 text-red-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {status.replace(/_/g, ' ').toUpperCase()}
        </span>
      </div>

      <h3 className="text-sm font-semibold mb-2">Live Log Stream</h3>
      <div 
        ref={scrollRef}
        className="h-64 overflow-y-auto border rounded bg-gray-50 dark:bg-gray-900 p-2 font-mono text-xs"
      >
        {events.length === 0 ? (
          <p className="text-gray-400 italic text-center mt-10">Waiting for live events...</p>
        ) : (
          events.map((event, idx) => (
            <div key={`${event.timestamp}-${idx}`} className="mb-1 border-b border-gray-200 dark:border-gray-700 pb-1 last:border-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <span className="text-gray-400 mr-2">[{new Date(event.timestamp).toLocaleTimeString()}]</span>
              <span className={`font-bold mx-2 ${
                  event.eventType === 'ERROR' ? 'text-red-600' :
                  event.eventType === 'LINK_FOUND' ? 'text-green-600' :
                  'text-purple-600'
              }`}>
                {event.eventType}
              </span>
              <span className="text-gray-700 dark:text-gray-300 break-all">
                {typeof event.payload === 'object' ? JSON.stringify(event.payload) : String(event.payload)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
