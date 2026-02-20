'use client';

import React, { useEffect } from 'react';
import { useGetJobSnapshotQuery } from '../store/api/jobApi';
import { useLiveJobEvents } from '../hooks/useLiveJobEvents';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setInitialState } from '../store/slices/liveJobSlice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Globe, Terminal } from 'lucide-react';

interface LiveJobProcessProps {
  jobId: string;
}

export default function LiveJobProcess({ jobId }: LiveJobProcessProps) {
  const dispatch = useAppDispatch();
  const { data: snapshot, isLoading, error } = useGetJobSnapshotQuery(jobId);
  
  // Connect to WebSocket only after we have the snapshot? 
  // Or just connect and let it flow. The hook handles connection.
  // But we want to set initial state from snapshot first.
  
  const { status, logs, links, completed, isConnected } = useAppSelector(state => state.liveJob);

  // Load snapshot into Redux
  useEffect(() => {
    if (snapshot) {
      dispatch(setInitialState(snapshot));
    }
  }, [snapshot, dispatch]);

  // Connect WebSocket
  // We pass jobId to the hook. It will connect.
  // If we want to wait for snapshot, we could pass null until snapshot is loaded.
  // But connecting early is fine, events will just append.
  // However, strict order "snapshot first" means we should wait.
  useLiveJobEvents(snapshot ? jobId : null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading job snapshot...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">
        Error loading job snapshot. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header / Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold tracking-tight">Job Progress</h2>
          <Badge variant={completed ? (status === 'failed' ? 'destructive' : 'default') : 'secondary'}>
            {status.toUpperCase()}
          </Badge>
          {isConnected ? (
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
              Live
            </Badge>
          ) : (
            <Badge variant="outline" className="text-gray-500">
              Offline
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Logs Console */}
        <Card className="h-[500px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              <Terminal className="w-4 h-4 mr-2" />
              Live Logs ({logs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full p-4 font-mono text-xs">
              {logs.map((log, i) => (
                <div key={i} className="mb-1 break-all">
                  <span className="text-gray-400 mr-2">
                    {new Date(log.timestamp || Date.now()).toLocaleTimeString()}
                  </span>
                  <span className={log.level === 'error' ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}>
                    {typeof log === 'string' ? log : (log.message || JSON.stringify(log))}
                  </span>
                </div>
              ))}
              <div id="logs-end" />
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Links Found */}
        <Card className="h-[500px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              <Globe className="w-4 h-4 mr-2" />
              Links Found ({links.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full p-4 text-sm">
              {links.map((link, i) => (
                <div key={i} className="flex items-center mb-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                  <div className="flex-1 truncate">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {link.url}
                    </a>
                  </div>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {link.statusCode || 200}
                  </Badge>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
