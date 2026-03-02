'use client';

import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import liveJobReducer from './slices/liveJobSlice';
import jobProgressReducer from './slices/jobProgressSlice';

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    liveJob: liveJobReducer,
    jobProgress: jobProgressReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
