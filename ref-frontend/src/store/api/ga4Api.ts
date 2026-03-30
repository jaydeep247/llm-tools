import { baseApi } from './baseApi';

export interface GA4Property {
  id: string;
  displayName: string;
  accountId: string;
  accountName: string;
}

export interface GA4PageTraffic {
  pageTitle: string;
  pagePath: string;
  sessions: number;
  views: number;
  activeUsers: number;
  viewsPerActiveUser: number;
  avgEngagementTime: number; // seconds
  eventCount: number;
  keyEvents: number;
}

export interface GA4TrafficResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  totalViews: number;
  totalActiveUsers: number;
  totalEventCount: number;
  totalKeyEvents: number;
  pages: GA4PageTraffic[];
}

export interface GA4StatusResponse {
  connected: boolean;
  selectedPropertyId?: string | null;
}

export interface GA4TrafficParams {
  propertyId: string;
  startDate?: string;
  endDate?: string;
}

const GA4_PREFIX = '/ga4';

export const ga4Api = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getGA4Status: builder.query<GA4StatusResponse, void>({
      query: () => `${GA4_PREFIX}/status`,
      transformResponse: (response: { data: GA4StatusResponse }) => response.data,
      providesTags: ['GA4'],
    }),

    listGA4Properties: builder.query<GA4Property[], void>({
      query: () => `${GA4_PREFIX}/properties`,
      transformResponse: (response: { data: GA4Property[] }) => response.data,
      providesTags: ['GA4'],
    }),

    selectGA4Property: builder.mutation<void, { propertyId: string }>({
      query: (body) => ({
        url: `${GA4_PREFIX}/select-property`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['GA4'],
    }),

    getGA4Traffic: builder.query<GA4TrafficResponse, GA4TrafficParams>({
      query: ({ propertyId, startDate = '30daysAgo', endDate = 'today' }) => ({
        url: `${GA4_PREFIX}/traffic`,
        params: { propertyId, startDate, endDate },
      }),
      transformResponse: (response: { data: GA4TrafficResponse }) => response.data,
      providesTags: ['GA4'],
    }),

    disconnectGA4: builder.mutation<void, void>({
      query: () => ({
        url: `${GA4_PREFIX}/disconnect`,
        method: 'POST',
      }),
      invalidatesTags: ['GA4'],
    }),
  }),
});

export const {
  useGetGA4StatusQuery,
  useListGA4PropertiesQuery,
  useSelectGA4PropertyMutation,
  useGetGA4TrafficQuery,
  useLazyGetGA4TrafficQuery,
  useDisconnectGA4Mutation,
} = ga4Api;
