import { baseApi } from './baseApi'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandMentionSearchResult {
  rank: number
  title: string
  url: string
  snippet: string
  source_domain: string
}

export interface BrandMentionSearchResponse {
  query: string
  total_results: number
  results: BrandMentionSearchResult[]
}

export interface BrandMentionScanResult {
  id: string
  brandName: string
  domain: string
  query: string
  rank: number
  found_url: string
  title: string
  snippet: string
  source_domain: string
  found_date: string
}

export interface BrandMentionScanResponse {
  scanned_queries: number
  new_mentions: number
  duplicate_skipped: number
  results: BrandMentionScanResult[]
}

export interface BrandMentionSearchRequest {
  query: string
  num?: number
}

export interface BrandMentionScanRequest {
  brandName: string
  domain: string
  queries?: string[]
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const brandMentionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Free-form search — any query, results not saved to DB
    searchBrandMentions: builder.mutation<
      BrandMentionSearchResponse,
      BrandMentionSearchRequest
    >({
      query: (data) => ({
        url: '/brand-mentions/search',
        method: 'POST',
        body: {
          query: data.query,
          num: data.num ?? 10,
        },
      }),
      transformResponse: (response: { success: boolean; data: BrandMentionSearchResponse }) =>
        response.data,
    }),

    // Scan with brand context — saves results to DB
    scanBrandMentions: builder.mutation<
      BrandMentionScanResponse,
      BrandMentionScanRequest
    >({
      query: (data) => ({
        url: '/brand-mentions/scan',
        method: 'POST',
        body: {
          brandName: data.brandName,
          domain: data.domain,
          queries: data.queries,
        },
      }),
      transformResponse: (response: { success: boolean; data: BrandMentionScanResponse }) =>
        response.data,
    }),

    // Get mention results for multiple queries
    searchMultipleQueries: builder.mutation<
      { results: Array<{ query: string; results: BrandMentionSearchResult[] }> },
      { queries: string[]; num?: number }
    >({
      async queryFn(args, api, extraOptions, baseQuery) {
        try {
          // Use allSettled to handle per-query failures gracefully
          const settled = await Promise.allSettled(
            args.queries.map(async (query) => {
              const result = await baseQuery({
                url: '/brand-mentions/search',
                method: 'POST',
                body: { query, num: args.num ?? 10 },
              })
              
              // If error, return empty results for this query
              if (result.error) {
                return { query, results: [] }
              }
              
              // Extract nested response: { success, data: { query, total_results, results } }
              const responseBody = (result.data as any) || {}
              const searchData = responseBody.data as BrandMentionSearchResponse | undefined
              
              return {
                query,
                results: searchData?.results ?? [],
              }
            }),
          )
          
          // Map settled results - rejected promises return empty, fulfilled return data
          const results = settled.map((settlement) => {
            if (settlement.status === 'fulfilled') {
              return settlement.value
            }
            // If promise was rejected, return empty results for that query
            return { query: 'unknown', results: [] }
          })
          
          return { data: { results } }
        } catch (error) {
          return {
            error: {
              status: 500,
              data: error instanceof Error ? error.message : 'Failed to search queries',
            },
          }
        }
      },
    }),
  }),
})

export const {
  useSearchBrandMentionsMutation,
  useScanBrandMentionsMutation,
  useSearchMultipleQueriesMutation,
} = brandMentionsApi

export const { searchBrandMentions, scanBrandMentions } = brandMentionsApi.endpoints
