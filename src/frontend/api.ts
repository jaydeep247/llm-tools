// Use environment variables with fallback to empty string for development
// In development, empty string means requests go through Vite proxy (configured in vite.config.ts)
// In production, set VITE_API_BASE_URL to your production domain
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const AEO_API_BASE_URL = import.meta.env.VITE_AEO_API_BASE_URL || 'http://localhost:8000';

export interface AnalysisResult {
  success: boolean;
  url: string;
  grade: string;
  grade_color: string;
  overall_score: number;

  // --- NEW MODULE C FIELDS ---
  llm_friendliness_score?: number;
  // ---------------------------

  module_scores?: {
    ai_presence: number;
    competitor_analysis: number;
    knowledge_base: number;
    answerability: number;
    crawler_accessibility: number;
    structured_data?: number;
  };
  module_weights?: {
    ai_presence: number;
    competitor: number;
    strategy_review: number;
  };
  detailed_analysis?: {
    ai_presence: any;
    competitor_analysis: any;
    knowledge_base: any; // Contains readability_score and fact_density
    answerability: any;
    crawler_accessibility: any;
    structured_data?: any;
  };
  structured_data?: {
    total_schemas: number;
    valid_schemas: number;
    invalid_schemas: number;
    schema_types: string[];
    coverage_score: number;
    quality_score: number;
    completeness_score: number;
    seo_relevance_score: number;
    details: any;
  };
  all_recommendations?: string[];
  analysis_timestamp?: string;
  run_id?: string;
  errors?: string[];
  warnings?: string[];
  recommendations?: string[];
}

class ApiService {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('accessToken');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Refresh the access token using the httpOnly cookie
   */
  private async refreshToken(): Promise<string | null> {
    try {
      // Use relative URL to go through Vite proxy in development, or absolute URL in production
      const refreshUrl = this.baseURL ? `${this.baseURL}/api/auth/refresh` : '/api/auth/refresh';
      const response = await fetch(refreshUrl, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        return data.accessToken;
      }
      return null;
    } catch (error) {
      console.error('RefreshToken failed:', error);
      return null;
    }
  }

  /**
   * Fetch with timeout support and auto-retry on 401
   * @param url - URL to fetch
   * @param options - Fetch options
   * @param timeout - Timeout in milliseconds (default: 5 minutes for long-running operations)
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout: number = 300000 // 5 minutes default for AEO analysis
  ): Promise<Response> {
    const doFetch = async (token?: string) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      } else if (!headers.has('Authorization')) {
        // Try to get from storage if not provided
        const stored = localStorage.getItem('accessToken');
        if (stored) headers.set('Authorization', `Bearer ${stored}`);
      }

      try {
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal
        });
        clearTimeout(id);
        return response;
      } catch (error: any) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout - Analysis is taking longer than expected.');
        }
        throw error;
      }
    };

    let response = await doFetch();

    // Handle 401 with Refresh Token
    if (response.status === 401 && !url.includes('/auth/refresh')) {
      console.log('Token expired, attempting refresh...');
      const newToken = await this.refreshToken();

      if (newToken) {
        console.log('Token refreshed, retrying request...');
        response = await doFetch(newToken);
      }
    }

    return response;
  }

  async analyzeUrl(url: string, crawlerOptions?: {
    allowSubdomains: boolean;
    runAudits: boolean;
    auditDevice: 'mobile' | 'desktop';
    captureLinkDetails: boolean;
    forceRecrawl?: boolean;
  }): Promise<any> {
    try {
      if (crawlerOptions) {
        // First, start the crawler
        console.log(`Starting crawler for: ${url}`, crawlerOptions);

        const crawlResponse = await this.fetchWithTimeout('/api/crawl', {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            url: url.trim(),
            allowSubdomains: crawlerOptions.allowSubdomains,
            runAudits: crawlerOptions.runAudits,
            auditDevice: crawlerOptions.auditDevice,
            captureLinkDetails: crawlerOptions.captureLinkDetails,
            forceRecrawl: Boolean(crawlerOptions.forceRecrawl)
          })
        }, 300000); // 5 minutes for crawl + analysis

        if (!crawlResponse.ok) {
          let errorData: any = {};
          try {
            errorData = await crawlResponse.json();
          } catch (e) {
            // If JSON parsing fails, use status-based messages
          }

          // Handle authentication errors
          if (crawlResponse.status === 401) {
            localStorage.removeItem('accessToken');
            window.location.href = '/login';
            throw new Error('Please login to continue');
          }

          // Handle rate limit errors
          if (crawlResponse.status === 429) {
            throw new Error(errorData.message || 'Too many requests. Please wait 1 minute and try again.');
          }

          throw new Error(errorData.error || errorData.message || 'Crawler failed to start');
        }

        const crawlData = await crawlResponse.json();

        // Surface reuse info to the caller to decide (show modal)
        if (crawlData.reuseMode && crawlData.sessionId) {
          return {
            reuseMode: true,
            sessionId: crawlData.sessionId,
            url: crawlData.url || url.trim(),
            hasAudits: crawlData.hasAudits,
            auditsTriggered: crawlData.auditsTriggered,
            auditsInProgress: crawlData.auditsInProgress,
            message: crawlData.message,
          };
        }

        // Then get AEO analysis for the main URL
        console.log(`Getting AEO analysis for: ${url} (via proxy)`);

        const aeoResponse = await this.fetchWithTimeout(
          `/aeo/analyze`,
          {
            method: 'POST',
            headers: this.getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({
              url: url.trim(),
              sessionId: crawlData.sessionId
            }),
          },
          300000 // 5 minutes timeout for full backlinks analysis
        );

        if (!aeoResponse.ok) {
          let errorData: any = {};
          try {
            errorData = await aeoResponse.json();
          } catch (e) {
            // If JSON parsing fails, use status-based messages
          }

          // Handle authentication errors
          if (aeoResponse.status === 401) {
            localStorage.removeItem('accessToken');
            window.location.href = '/login';
            throw new Error('Please login to continue');
          }

          // Handle rate limit errors
          if (aeoResponse.status === 429) {
            throw new Error(errorData.message || 'Too many requests. Please wait 1 minute and try again.');
          }

          throw new Error(errorData.error || errorData.message || 'AEO analysis failed');
        }

        const aeoData = await aeoResponse.json();
        console.log('AEO API Response:', aeoData);

        // Handle the response structure from AEO API
        if (aeoData.success && aeoData.results) {
          // Automatically trigger Module E analysis (Content Consistency + Entity Coverage + Brand)
          console.log(`Automatically triggering Module E analysis for: ${url}`);
          try {
            const moduleEResponse = await this.fetchWithTimeout(
              `/aeo/website-score`,
              {
                method: 'POST',
                headers: this.getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                  url: url.trim(),
                  sessionId: crawlData.sessionId
                }),
              },
              300000 // 5 minutes timeout
            );

            if (moduleEResponse.ok) {
              const moduleEData = await moduleEResponse.json();
              console.log('Module E analysis completed automatically:', moduleEData);

              // Merge Module E results into AEO results
              if (moduleEData.success && moduleEData.scores) {
                if (!aeoData.results.module_scores) {
                  aeoData.results.module_scores = {};
                }

                // Add Module E scores to module_scores
                aeoData.results.module_scores.consistency = moduleEData.scores.consistency;
                aeoData.results.module_scores.brand_metrics = moduleEData.scores.brand_metrics;

                // Add entity_coverage to top level
                aeoData.results.entity_coverage = moduleEData.scores.entity_coverage;

                console.log('Merged Module E data into AEO results:', {
                  consistency: moduleEData.scores.consistency,
                  hasBrandMetrics: !!moduleEData.scores.brand_metrics,
                  hasEntityCoverage: !!moduleEData.scores.entity_coverage
                });
              }
            } else {
              console.warn('Module E analysis failed, but continuing with AEO results');
            }
          } catch (moduleEError) {
            console.warn('Module E analysis error (non-critical):', moduleEError);
            // Don't fail the whole analysis if Module E fails
          }

          return aeoData.results;
        } else {
          throw new Error(aeoData.error || 'AEO analysis failed');
        }
      } else {
        // Call the AEO analyzer endpoint for single page analysis
        console.log(`Making API call via proxy to: /aeo/analyze`);
        console.log(`Analyzing URL: ${url}`);

        const response = await this.fetchWithTimeout(
          `/aeo/analyze`,
          {
            method: 'POST',
            headers: this.getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({ url: url.trim() }),
          },
          300000 // 5 minutes timeout for full backlinks analysis
        );

        if (!response.ok) {
          let errorData: any = {};
          try {
            errorData = await response.json();
          } catch (e) {
            // If JSON parsing fails, use status-based messages
          }

          // Handle authentication errors
          if (response.status === 401) {
            localStorage.removeItem('accessToken');
            window.location.href = '/login';
            throw new Error('Please login to continue');
          }

          // Handle rate limit errors
          if (response.status === 429) {
            throw new Error(errorData.message || 'Too many requests. Please wait 1 minute and try again.');
          }

          throw new Error(errorData.error || errorData.message || 'AEO analysis failed');
        }

        const data = await response.json();
        console.log('AEO API Response (single page):', data);

        // Handle the response structure from AEO API
        if (data.success && data.results) {
          return data.results;
        } else {
          throw new Error(data.error || 'AEO analysis failed');
        }
      }
    } catch (error: any) {
      console.error('API Error:', error);
      throw new Error(error.message || 'Failed to analyze URL');
    }
  }

  // --- NEW: Run Bulk Module C Audit ---
  /**
   * Run Bulk Module C Audit
   * @param sitemapUrl - Optional URL to sitemap.xml
   * @param urls - Optional array of specific URLs
   */
  async analyzeBulk(sitemapUrl?: string, urls?: string[]): Promise<any> {
    try {
      console.log('Starting Bulk Analysis...');

      // ✅ FIX: Use '/aeo/analyze-bulk' to match the working '/aeo/analyze' endpoint
      const response = await this.fetchWithTimeout(
        '/aeo/analyze-bulk',
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            sitemap: sitemapUrl,
            urls: urls
          }),
        },
        600000 // 10 minutes timeout
      );

      if (!response.ok) {
        let errorMsg = 'Bulk analysis failed';
        try {
          const errData = await response.json();
          errorMsg = errData.detail || errData.error || errorMsg;
        } catch (e) {
          errorMsg = `Server Error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      return data.data;

    } catch (error: any) {
      console.error('Bulk API Error:', error);
      throw error;
    }
  }
  // ------------------------------------

  /**
   * Simulate AI answer for a given URL and query
   * @param url - The URL to analyze
   * @param query - The user query to simulate
   */
  async simulateAnswer(url: string, query: string): Promise<any> {
    try {
      console.log('Starting AI Answer Simulation...', { url, query });

      const response = await this.fetchWithTimeout(
        '/aeo/simulate-answer',
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            url: url.trim(),
            query: query.trim()
          }),
        },
        120000 // 2 minutes timeout for AI simulation
      );

      if (!response.ok) {
        let errorMsg = 'AI simulation failed';
        try {
          const errData = await response.json();
          errorMsg = errData.detail || errData.error || errorMsg;
        } catch (e) {
          errorMsg = `Server Error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      return data.results || data;

    } catch (error: any) {
      console.error('Simulation API Error:', error);
      throw error;
    }
  }
  // ------------------------------------

  async healthCheck(): Promise<{ status: string; service: string }> {
    try {
      console.log(`Making health check to: ${this.baseURL}/health`);

      const response = await fetch(`${this.baseURL}/health`);
      const data = await response.json();

      console.log('Health check response:', data);
      return data;
    } catch (error: any) {
      console.error('Health check error:', error);
      throw new Error('Health check failed - backend may not be running');
    }
  }

  async getSessionData(sessionId: number): Promise<{
    data: any[];
    totalPages: number;
    totalResources: number;
    session?: any;
    statistics?: any;
    logs?: Array<{ id: number; message: string; level: string; timestamp: string }>;
  }> {
    try {
      const url = `${this.baseURL}/api/data/list?sessionId=${sessionId}`;
      console.log('[getSessionData] Fetching:', url);
      
      const response = await this.fetchWithTimeout(
        url,
        {
          headers: this.getAuthHeaders(),
          credentials: 'include'
        },
        30000 // 30 second timeout
      );

      console.log('[getSessionData] Response status:', response.status);
      console.log('[getSessionData] Response headers:', {
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length')
      });

      if (!response.ok) {
        // Check if response is HTML (error page)
        const contentType = response.headers.get('content-type');
        console.log('[getSessionData] Error response content-type:', contentType);
        
        if (contentType && contentType.includes('text/html')) {
          console.error('Received HTML response instead of JSON:', {
            status: response.status,
            statusText: response.statusText,
            url: response.url
          });
          
          if (response.status === 404) {
            throw new Error(`Session ${sessionId} not found`);
          } else if (response.status === 500) {
            throw new Error('Server error while fetching session data');
          } else {
            throw new Error(`Failed to fetch session data (HTTP ${response.status})`);
          }
        }

        // Handle authentication errors
        if (response.status === 401) {
          localStorage.removeItem('accessToken');
          window.location.href = '/login';
          throw new Error('Please login to continue');
        }

        // Try to get error message from JSON response
        let errorMessage = 'Failed to fetch session data';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // If JSON parsing fails, use generic message
          errorMessage = `Failed to fetch session data (HTTP ${response.status})`;
        }
        
        throw new Error(errorMessage);
      }

      // Check content type before parsing
      const contentType = response.headers.get('content-type');
      console.log('[getSessionData] Success response content-type:', contentType);
      
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Expected JSON but received:', contentType);
        
        // Try to read the response body for debugging
        const text = await response.text();
        console.error('[getSessionData] Response body preview:', text.substring(0, 200));
        
        throw new Error('Server returned invalid response format (expected JSON)');
      }

      const data = await response.json();
      console.log('[getSessionData] Success! Data keys:', Object.keys(data));
      return data;
    } catch (error: any) {
      console.error('Get session data error:', error);
      
      // Provide more specific error messages
      if (error.message.includes('timeout')) {
        throw new Error('Request timeout - please try again');
      } else if (error.message.includes('Failed to fetch')) {
        throw new Error('Network error - please check your connection');
      }
      
      throw new Error(error.message || 'Failed to fetch session data');
    }
  }
}

export const apiService = new ApiService();
export default apiService;