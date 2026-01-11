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

/**
 * Extract SEO keywords from a URL by fetching HTML and calling the Python API
 * This is a shared function used by both the Redis worker and on-demand extraction
 */
export async function extractSeoKeywords(url: string, config?: any): Promise<any> {
  const cfg = config || loadConfig();
  const pythonApiBase = cfg.pythonApiBase || process.env.PY_API_BASE || 'http://localhost:8000';
  
  try {
    // Fetch HTML content
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEO-Extractor/1.0)' },
      signal: AbortSignal.timeout(cfg.timeoutMs || 30000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    if (!html || html.trim().length === 0) {
      throw new Error('No HTML content retrieved');
    }
    
    // Call Python API for keyword extraction
    const payload = {
      url: url,
      final_url: response.url,
      status_code: response.status,
      html: html,
      fetched_at: new Date().toISOString()
    };
    
    const seoResponse = await fetch(`${pythonApiBase}/extract_html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.timeoutMs || 30000)
    });
    
    if (!seoResponse.ok) {
      const errorText = await seoResponse.text();
      throw new Error(`SEO API error: ${seoResponse.status} - ${errorText}`);
    }
    
    return await seoResponse.json();
  } catch (error) {
    throw new Error(`SEO extraction failed for ${url}: ${(error as Error).message}`);
  }
}

/**
 * Extract SEO keywords with retry logic
 */
export async function extractSeoKeywordsWithRetry(url: string, config?: any): Promise<any> {
  const cfg = config || loadConfig();
  const maxRetries = cfg.retries || 2;
  const backoffBase = cfg.backoffBaseMs || 1000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await extractSeoKeywords(url, cfg);
      return result;
    } catch (error) {
      console.error(`[on-demand-extractor] Attempt ${attempt}/${maxRetries} failed for ${url}:`, (error as Error).message);
      
      if (attempt < maxRetries) {
        const backoffDelay = backoffBase * Math.pow(2, attempt - 1);
        console.log(`[on-demand-extractor] Retrying ${url} in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to extract SEO keywords after ${maxRetries} attempts`);
}
