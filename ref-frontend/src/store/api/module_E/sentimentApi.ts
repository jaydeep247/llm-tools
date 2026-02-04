import { baseApi } from '../baseApi';

export interface SentimentTrackingRequest {
  brand_name: string;
}

export interface SentimentTrackingResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface SentimentHistoryResponse {
  success: boolean;
  history?: any[];
  latestResult?: any;
  error?: string;
}

export const sentimentApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    trackSentiment: builder.mutation<SentimentTrackingResponse, SentimentTrackingRequest>({
      query: (data) => ({
        url: '/api/aeo/sentiment-tracking',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Sentiment'],
    }),
    getSentimentHistory: builder.query<SentimentHistoryResponse, string>({
      query: (brandName) => `/api/aeo/sentiment-history/${encodeURIComponent(brandName)}`,
      providesTags: (result, error, brandName) => [{ type: 'Sentiment', id: brandName }],
    }),
  }),
});

export const {
  useTrackSentimentMutation,
  useGetSentimentHistoryQuery,
  useLazyGetSentimentHistoryQuery,
} = sentimentApi;
