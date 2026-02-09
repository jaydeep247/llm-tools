import { baseApi } from '../baseApi';

// Types
export interface ImprovementAction {
  id: string;
  type: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  impact: number;
  effort: 'Easy' | 'Moderate' | 'Complex';
  category: string;
}

export interface ActionableInsightsData {
  totalActions: number;
  priorityBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
  currentScore: number;
  predictedScore: number;
  improvement: number;
  actions: ImprovementAction[];
}

export interface AnalyzePageActionsRequest {
  url?: string;
  content?: string;
  sessionId?: number;
}

export interface ActionableInsightsResponse {
  success: boolean;
  data?: ActionableInsightsData;
  error?: string;
  message?: string;
}

// API slice
export const actionableInsightsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getActionableInsights: builder.query<ActionableInsightsResponse, void>({
      query: () => ({
        url: '/api/actionable-insights/stats',
        method: 'GET',
      }),
      providesTags: ['Data'],
    }),

    analyzePageActions: builder.mutation<ActionableInsightsResponse, AnalyzePageActionsRequest>({
      query: (body) => ({
        url: '/api/actionable-insights/analyze',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Data'],
    }),

    getSessionActions: builder.query<ActionableInsightsResponse, number>({
      query: (sessionId) => ({
        url: `/api/actionable-insights/results/${sessionId}`,
        method: 'GET',
      }),
      providesTags: ['Data'],
    }),

    actionableInsightsHealthCheck: builder.query<{ success: boolean; message: string }, void>({
      query: () => ({
        url: '/api/actionable-insights/health',
        method: 'GET',
      }),
    }),
  }),
});

export const {
  useGetActionableInsightsQuery,
  useAnalyzePageActionsMutation,
  useGetSessionActionsQuery,
  useActionableInsightsHealthCheckQuery,
} = actionableInsightsApi;