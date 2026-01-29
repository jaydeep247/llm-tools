/**
 * On-demand SEO keyword extraction
 * Calls the Python API to extract SEO keywords from a URL
 */

import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve(process.cwd(), 'config', 'seo.json');

function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return cfg;
  } catch (e) {
    return {
      concurrency: 3,
      timeoutMs: 30000,
      retries: 2,
      backoffBaseMs: 1000,
      pythonApiBase: 'http://localhost:8000'
    };
  }
}

interface ExtractResult {
  keywords: any[];
  language?: string;
  parent?: {
    text?: string;
  };
}

/**
 * Extract SEO keywords from a URL using the Python API
 * The Python API requires HTML content, so we first fetch the URL to get HTML
 */
export async function extractSeoKeywords(url: string, config?: any): Promise<ExtractResult> {
  const cfg = config || loadConfig();
  // Prefer env so local dev (PY_API_BASE=http://localhost:8000) overrides seo.json (aeo-api:8000 for Docker)
  const apiBase = process.env.PY_API_BASE || cfg.pythonApiBase || 'http://localhost:8000';
  const timeoutMs = cfg.timeoutMs || 30000;

  // Python API endpoint for SEO extraction - uses /extract_html endpoint
  const apiUrl = `${apiBase}/extract_html`;

  try {
    // First, fetch the HTML content from the URL
    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!fetchResponse.ok) {
      throw new Error(`Failed to fetch URL: ${fetchResponse.status} ${fetchResponse.statusText}`);
    }

    const html = await fetchResponse.text();
    const finalUrl = fetchResponse.url || url;

    // Now send the HTML to the Python API for extraction
    const extractRequest = {
      url: url,
      final_url: finalUrl,
      status_code: fetchResponse.status,
      headers: Object.fromEntries(fetchResponse.headers.entries()),
      html: html,
      fetched_at: new Date().toISOString(),
      lang_guess: '' // Language will be detected by the API
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(extractRequest),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Python API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;

    return {
      keywords: data.keywords || [],
      language: data.language,
      parent: data.parent ? { text: data.parent.text || data.parent } : undefined
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`SEO extraction timeout after ${timeoutMs}ms`);
    }
    throw new Error(`SEO extraction failed: ${error.message}`);
  }
}

/**
 * Extract SEO keywords with retry logic
 */
export async function extractSeoKeywordsWithRetry(url: string, config?: any): Promise<ExtractResult> {
  const cfg = config || loadConfig();
  const maxRetries = cfg.retries || 2;
  const backoffBase = cfg.backoffBaseMs || 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await extractSeoKeywords(url, cfg);
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      const backoffDelay = backoffBase * Math.pow(2, attempt - 1);
      console.log(`[on-demand-extractor] Retrying ${url} in ${backoffDelay}ms (attempt ${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`SEO extraction failed after ${maxRetries} attempts`);
}
