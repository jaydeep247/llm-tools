import { baseApi } from '../baseApi';

export interface MissingEntity {
  entity: string;
  weight: number;
  reason: string;
}

export interface MissingInfoSummary {
  expected_count: number;
  present_count: number;
  missing_count: number;
  gap_percentage: number;
  weighted_gap_score: number;
}

export interface MissingInfoAnalysisData {
  summary: MissingInfoSummary;
  critical_missing: MissingEntity[];
  minor_missing: MissingEntity[];
}

export interface MissingInfoAnalysisResponse {
  success: boolean;
  url?: string;
  data?: MissingInfoAnalysisData;
  summary?: MissingInfoSummary;
  critical_missing?: MissingEntity[];
  minor_missing?: MissingEntity[];
  error?: string;
  details?: string;
}

export interface MissingInfoAnalysisRequest {
  url: string;
}

export const missingInfoAnalysisApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    analyzeMissingInfo: builder.query<MissingInfoAnalysisResponse, string>({
      query: (url) => ({
        url: `/api/analysis/missing-info?url=${encodeURIComponent(url)}`,
        method: 'GET',
      }),
      providesTags: (result, error, url) => [
        { type: 'Data', id: url },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useAnalyzeMissingInfoQuery,
  useLazyAnalyzeMissingInfoQuery,
} = missingInfoAnalysisApi;