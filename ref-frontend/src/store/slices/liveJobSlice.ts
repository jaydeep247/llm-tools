import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { JobSnapshot } from '../api/jobApi';

interface LiveJobState {
  currentJobId: string | null;
  status: string;
  logs: any[];
  links: any[];
  completed: boolean;
  lastEventTimestamp: number;
  isConnected: boolean;
}

const initialState: LiveJobState = {
  currentJobId: null,
  status: 'pending',
  logs: [],
  links: [],
  completed: false,
  lastEventTimestamp: 0,
  isConnected: false,
};

const liveJobSlice = createSlice({
  name: 'liveJob',
  initialState,
  reducers: {
    setInitialState: (state, action: PayloadAction<JobSnapshot>) => {
      const { jobId, status, logs, links, completed, snapshotAt } = action.payload;
      state.currentJobId = jobId;
      state.status = status;
      state.logs = logs || [];
      state.links = links || [];
      state.completed = completed;
      state.lastEventTimestamp = snapshotAt;
    },
    
    addLog: (state, action: PayloadAction<any>) => {
      // Avoid duplicates if needed, or just append
      // For high volume, we might want to limit the size
      state.logs.push(action.payload);
      if (state.logs.length > 1000) {
        state.logs = state.logs.slice(-1000);
      }
    },
    
    addLink: (state, action: PayloadAction<any>) => {
      state.links.push(action.payload);
      if (state.links.length > 1000) {
        state.links = state.links.slice(-1000);
      }
    },
    
    updateStatus: (state, action: PayloadAction<string>) => {
      state.status = action.payload;
      if (action.payload === 'completed' || action.payload === 'failed') {
        state.completed = true;
      }
    },
    
    markCompleted: (state) => {
      state.completed = true;
      state.status = 'completed';
    },
    
    setConnectionStatus: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload;
    },
    
    resetState: (state) => {
      return initialState;
    },
  },
});

export const {
  setInitialState,
  addLog,
  addLink,
  updateStatus,
  markCompleted,
  setConnectionStatus,
  resetState,
} = liveJobSlice.actions;

export default liveJobSlice.reducer;
