import { baseApi } from '../baseApi';

export interface DetectedEntity {
  name: string;
  type: 'heading' | 'noun_phrase' | 'repeated_concept';
  frequency: number;
  contextScore: number;
  firstFoundIn: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'content';
  relevanceScore: number;
}

export interface EntityCoverageData {
  entityCoveragePercent: number;
  entityRelevanceScore: number;
  detectedEntities: DetectedEntity[];
  missingEntities: string[];
  expectedEntitiesCount: number;
  detectedEntitiesCount: number;
}

export interface EntityCoverageRequest {
  url: string;
  expectedEntities?: string[];
  sessionId?: number;
}

export interface EntityCoverageResponse {
  success: boolean;
  data?: EntityCoverageData;
  error?: string;
  details?: string;
}

export interface CustomEntityCoverageRequest {
  url: string;
  customEntities: string[];
  sessionId?: number;
}

export interface CachedEntityCoverageResponse {
  success: boolean;
  data?: EntityCoverageData;
  message?: string;
  error?: string;
}

export const entityCoverageAuditApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    analyzeEntityCoverage: builder.mutation<EntityCoverageResponse, EntityCoverageRequest>({
      query: (data) => ({
        url: '/api/aeo/entity-coverage-audit',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['EntityCoverage'],
    }),
    
    analyzeWithCustomEntities: builder.mutation<EntityCoverageResponse, CustomEntityCoverageRequest>({
      query: (data) => ({
        url: '/api/aeo/entity-coverage-audit/custom',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['EntityCoverage'],
    }),
    
    getCachedEntityCoverage: builder.query<CachedEntityCoverageResponse, number>({
      query: (sessionId) => ({
        url: `/api/aeo/entity-coverage-audit/${sessionId}`,
        method: 'GET',
      }),
      providesTags: (result, error, sessionId) => [
        { type: 'EntityCoverage', id: sessionId },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useAnalyzeEntityCoverageMutation,
  useAnalyzeWithCustomEntitiesMutation,
  useGetCachedEntityCoverageQuery,
  useLazyGetCachedEntityCoverageQuery,
} = entityCoverageAuditApi;