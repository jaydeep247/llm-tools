import { baseApi } from './baseApi';

export interface BrandDescriptionRequest {
  url: string;
  jobId?: string;
}

export interface BrandDescriptionResponse {
  description: string;
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
  }),
});

export const {
  useGenerateBrandDescriptionMutation,
  useGetBrandDescriptionQuery,
  useLazyGetBrandDescriptionQuery,
} = brandOnboardingApi;
