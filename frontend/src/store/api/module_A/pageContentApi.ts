import { baseApi } from '../baseApi';

export interface PageContentResponse {
  success: boolean;
  data: {
    url: string;
    title: string;
    paragraphs: Array<{
      text: string;
      wordCount: number;
      element: string;
    }>;
    headings: Array<{
      level: number;
      text: string;
      content: string;
      wordCount: number;
    }>;
    sentences: Array<{
      text: string;
      wordCount: number;
    }>;
    listItems: Array<{
      text: string;
      wordCount: number;
      listType: 'ul' | 'ol';
    }>;
    topWords: Array<{
      word: string;
      count: number;
      percentage: string;
    }>;
    totalWords: number;
    uniqueWords: number;
    visibleTextPreview: string;
  };
}

export const pageContentApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPageContent: builder.query<PageContentResponse, { pageId: number }>({
      query: ({ pageId }) => `/api/pages/${pageId}/content`,
    }),
  }),
});

export const {
  useGetPageContentQuery,
  useLazyGetPageContentQuery,
} = pageContentApi;
