'use client';

import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import liveJobReducer from './slices/liveJobSlice';
import jobProgressReducer from './slices/jobProgressSlice';
import crawlProgressReducer from './slices/crawlProgressSlice';
import dateRangeReducer from './slices/dateRangeSlice';

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    liveJob: liveJobReducer,
    jobProgress: jobProgressReducer,
    crawlProgress: crawlProgressReducer,
    dateRange: dateRangeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
