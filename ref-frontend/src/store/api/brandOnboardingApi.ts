import { baseApi } from './baseApi';

export interface BrandDescriptionRequest {
  url: string;
  jobId?: string;
}

export interface BrandDescriptionResponse {
  description: string;
}

export interface BrandTopicsRequest {
  url: string;
  brandName: string;
  brandDescription: string;
  jobId?: string;
}

export interface BrandTopicsResponse {
  topics: string[];
}

export interface SaveBrandTopicsRequest {
  jobId: string;
  selectedTopics: string[];
}

export interface GeneratedPrompt {
  prompt: string;
  type: string;
}

export interface BrandPromptsRequest {
  brandName: string;
  brandDescription: string;
  selectedTopics: string[];
  jobId?: string;
}

export interface BrandPromptsResponse {
  prompts: GeneratedPrompt[];
}

export interface SaveBrandPromptsRequest {
  jobId: string;
  selectedPrompts: string[];
}

export interface OnboardingDataResponse {
  description: string | null;
  topics_generated: string[];
  topics_selected: string[];
  prompts_generated: GeneratedPrompt[];
  prompts_selected: string[];
  prompt_results: PromptResult[];
}

export interface BrandAnalysis {
  brand_mentioned: boolean;
  brand_name: string;
  mention_position: 'first' | 'middle' | 'last' | 'not mentioned';
  competitors_mentioned: string[];
  brand_visibility_score: number;
}

export interface ProviderResult {
  response: string;
  analysis: BrandAnalysis | null;
  error: string | null;
}

export interface PromptResult {
  prompt: string;
  type: string;
  results: {
    openai: ProviderResult;
    gemini: ProviderResult;
    claude: ProviderResult;
  };
}

export interface ExecuteBrandPromptsRequest {
  brandName: string;
  prompts: GeneratedPrompt[];
  jobId?: string;
}

export interface ExecuteBrandPromptsResponse {
  results: PromptResult[];
}

export const brandOnboardingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    generateBrandDescription: builder.mutation<
      BrandDescriptionResponse,
      BrandDescriptionRequest
    >({
      query: (data) => ({
        url: '/brand-onboarding/describe',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response: { success: boolean; data: BrandDescriptionResponse }) =>
        response.data,
    }),
    getBrandDescription: builder.query<
      BrandDescriptionResponse,
      string
    >({
      query: (jobId) => ({
        url: `/brand-onboarding/description/${jobId}`,
        method: 'GET',
      }),
      transformResponse: (response: { success: boolean; data: BrandDescriptionResponse }) =>
        response.data,
    }),
    getOnboardingData: builder.query<
      OnboardingDataResponse,
      string
    >({
      query: (jobId) => ({
        url: `/brand-onboarding/data/${jobId}`,
        method: 'GET',
      }),
      transformResponse: (response: { success: boolean; data: OnboardingDataResponse }) =>
        response.data,
    }),
    generateBrandTopics: builder.mutation<
      BrandTopicsResponse,
      BrandTopicsRequest
    >({
      query: (data) => ({
        url: '/brand-onboarding/topics',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response: { success: boolean; data: BrandTopicsResponse }) =>
        response.data,
    }),
    saveBrandTopics: builder.mutation<
      void,
      SaveBrandTopicsRequest
    >({
      query: (data) => ({
        url: '/brand-onboarding/topics/save',
        method: 'POST',
        body: data,
      }),
    }),
    generateBrandPrompts: builder.mutation<
      BrandPromptsResponse,
      BrandPromptsRequest
    >({
      query: (data) => ({
        url: '/brand-onboarding/prompts',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response: { success: boolean; data: BrandPromptsResponse }) =>
        response.data,
    }),
    saveBrandPrompts: builder.mutation<
      void,
      SaveBrandPromptsRequest
    >({
      query: (data) => ({
        url: '/brand-onboarding/prompts/save',
        method: 'POST',
        body: data,
      }),
    }),
    executeBrandPrompts: builder.mutation<
      ExecuteBrandPromptsResponse,
      ExecuteBrandPromptsRequest
    >({
      query: (data) => ({
        url: '/brand-onboarding/prompts/execute',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response: { success: boolean; data: ExecuteBrandPromptsResponse }) =>
        response.data,
    }),
    getBrandPromptResults: builder.query<
      ExecuteBrandPromptsResponse,
      string
    >({
      query: (jobId) => ({
        url: `/brand-onboarding/prompts/results/${jobId}`,
        method: 'GET',
      }),
      transformResponse: (response: { success: boolean; data: ExecuteBrandPromptsResponse }) =>
        response.data,
    }),
  }),
});

export const {
  useGenerateBrandDescriptionMutation,
  useGetBrandDescriptionQuery,
  useLazyGetBrandDescriptionQuery,
  useLazyGetOnboardingDataQuery,
  useGenerateBrandTopicsMutation,
  useSaveBrandTopicsMutation,
  useGenerateBrandPromptsMutation,
  useSaveBrandPromptsMutation,
  useExecuteBrandPromptsMutation,
  useLazyGetBrandPromptResultsQuery,
} = brandOnboardingApi;
