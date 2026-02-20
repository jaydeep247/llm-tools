'use client';

import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import liveJobReducer from './slices/liveJobSlice';

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    liveJob: liveJobReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
