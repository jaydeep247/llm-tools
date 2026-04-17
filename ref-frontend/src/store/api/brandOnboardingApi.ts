import { baseApi } from './baseApi';

// --- Rich brand profile returned by Stage 2 ---
export interface BrandTargetAudience {
  segment: string;
  company_type: string | null;
  evidence: string | null;
}

export interface BrandUseCase {
  use_case: string;
  evidence: string | null;
}

export interface BrandKeyFeature {
  feature: string;
  description: string | null;
  source_page: string | null;
}

export interface BrandProfile {
  brand_name: string | null;
  one_liner: string | null;
  description: string | null;
  product_category: string | null;
  business_model: string | null;
  target_audience: BrandTargetAudience[];
  core_use_cases: BrandUseCase[];
  key_features: BrandKeyFeature[];
  pain_points_solved: string[];
  differentiators: string[];
  pricing_model: string | null;
  pricing_tiers: string[];
  geographic_focus: string | null;
  integrations_mentioned: string[];
  competitors_mentioned: string[];
  technology_signals: string[];
  content_themes: string[];
  website_url: string | null;
}

export interface BrandDescriptionRequest {
  url: string;
  jobId?: string;
}

export interface BrandDescriptionResponse {
  description: string;
  profile: BrandProfile | null;
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
  journey_stage?: string;
}

export interface TopicPrompts {
  topic: string;
  prompts: GeneratedPrompt[];
}

export interface BrandPromptsRequest {
  brandName: string;
  brandDescription: string;
  selectedTopics: string[];
  jobId?: string;
}

export interface BrandPromptsResponse {
  topics: TopicPrompts[];
}

export interface SaveBrandPromptsRequest {
  jobId: string;
  selectedPrompts: string[];
}

export interface BrandMentionCount {
  name: string;
  count: number;
}

export interface CompetitiveBrand {
  name: string;
  mention_count: number;
  avg_rank: number | null;
  providers_mentioned: string[];
  is_our_brand: boolean;
  organic_rank: number;
}

export interface AggregateStats {
  total_responses: number;
  brand_presence_count: number;
  brand_presence_total: number;
  brand_presence_rate: number;
  avg_rank: number | null;
  positive_mentions: number;
  negative_mentions: number;
  neutral_mentions: number;
  competitors_presence: BrandMentionCount[];
  all_brand_mentions: BrandMentionCount[];
}

export interface OnboardingDataResponse {
  description: string | null;
  topics_generated: string[];
  topics_selected: string[];
  prompts_generated: TopicPrompts[];
  prompts_selected: string[];
  prompt_results: PromptResult[];
  aggregate?: AggregateStats;
  competitive_landscape?: CompetitiveBrand[];
}

export interface BrandAnalysis {
  brand_mentioned: boolean;
  brand_mention_count: number;
  brand_rank: number | null;
  brand_rank_out_of: number;
  mention_position: 'early' | 'middle' | 'late' | 'not_mentioned';
  sentiment: 'positive' | 'neutral' | 'negative' | 'not_mentioned';
  in_title: boolean;
  competitors_mentioned: BrandMentionCount[];
  all_mentioned_brands: BrandMentionCount[];
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
  topic?: string;
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
  aggregate?: AggregateStats;
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
  useGetOnboardingDataQuery,
  useLazyGetOnboardingDataQuery,
  useGenerateBrandTopicsMutation,
  useSaveBrandTopicsMutation,
  useGenerateBrandPromptsMutation,
  useSaveBrandPromptsMutation,
  useExecuteBrandPromptsMutation,
  useLazyGetBrandPromptResultsQuery,
} = brandOnboardingApi;
