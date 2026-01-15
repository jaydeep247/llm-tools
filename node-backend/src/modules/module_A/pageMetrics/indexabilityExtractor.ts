import type { CheerioAPI } from 'cheerio';
import type { CrawlResponse } from './types.js';

/**
 * Indexability data extracted from meta tags and headers
 */
export interface IndexabilityData {
  indexable: boolean;
  indexabilityStatus: string;
  source: 'meta' | 'header' | 'both' | 'none';
  directives: string[];
  xRobotsTag?: string;
  details?: string;
}

/**
 * Parse robots directive string into individual directives
 */
export function parseRobotsDirective(directive: string): string[] {
  if (!directive) return [];
  
  return directive
    .toLowerCase()
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0);
}

/**
 * Check if robots directives contain noindex
 */
export function hasNoIndex(directives: string[]): boolean {
  return directives.some(d => 
    d === 'noindex' || 
    d === 'none' || 
    d.includes('noindex')
  );
}

/**
 * Check meta robots tags for indexability
 */
export function checkMetaRobots($: CheerioAPI): {
  hasNoIndex: boolean;
  directives: string[];
} {
  const allDirectives: string[] = [];
  
  // Check standard robots meta tag
  const robotsMeta = $('meta[name="robots"]').attr('content');
  if (robotsMeta) {
    const directives = parseRobotsDirective(robotsMeta);
    allDirectives.push(...directives);
  }
  
  // Check googlebot meta tag
  const googlebotMeta = $('meta[name="googlebot"]').attr('content');
  if (googlebotMeta) {
    const directives = parseRobotsDirective(googlebotMeta);
    allDirectives.push(...directives);
  }
  
  // Check bingbot meta tag
  const bingbotMeta = $('meta[name="bingbot"]').attr('content');
  if (bingbotMeta) {
    const directives = parseRobotsDirective(bingbotMeta);
    allDirectives.push(...directives);
  }
  
  return {
    hasNoIndex: hasNoIndex(allDirectives),
    directives: [...new Set(allDirectives)] // Remove duplicates
  };
}

/**
 * Check X-Robots-Tag HTTP header for indexability
 */
export function checkXRobotsTag(response?: CrawlResponse): {
  hasNoIndex: boolean;
  directives: string[];
  rawValue?: string;
} {
  const allDirectives: string[] = [];
  let rawValue: string | undefined;
  
  if (!response?.headers) {
    return { hasNoIndex: false, directives: [] };
  }
  
  // X-Robots-Tag can be lowercase or mixed case
  const xRobotsTag = response.headers['x-robots-tag'] || 
                     response.headers['X-Robots-Tag'];
  
  if (xRobotsTag) {
    rawValue = Array.isArray(xRobotsTag) ? xRobotsTag.join(',') : xRobotsTag;
    const directives = parseRobotsDirective(rawValue);
    allDirectives.push(...directives);
  }
  
  return {
    hasNoIndex: hasNoIndex(allDirectives),
    directives: [...new Set(allDirectives)],
    rawValue
  };
}

/**
 * Determine indexability status description
 */
export function getIndexabilityStatus(directives: string[]): string {
  if (directives.length === 0) {
    return 'indexable';
  }
  
  const hasNoIndexDirective = hasNoIndex(directives);
  const hasNoFollow = directives.some(d => d === 'nofollow' || d === 'none');
  
  if (hasNoIndexDirective && hasNoFollow) {
    return 'noindex, nofollow';
  } else if (hasNoIndexDirective) {
    return 'noindex';
  } else if (hasNoFollow) {
    return 'nofollow';
  } else if (directives.includes('none')) {
    return 'noindex, nofollow';
  }
  
  // Other directives present but not blocking indexing
  return `indexable (${directives.join(', ')})`;
}

/**
 * Extract indexability information from page
 */
export function extractIndexability(
  $: CheerioAPI,
  response?: CrawlResponse
): IndexabilityData {
  // Check meta tags
  const metaResult = checkMetaRobots($);
  
  // Check HTTP headers
  const headerResult = checkXRobotsTag(response);
  
  // Combine directives from both sources
  const allDirectives = [
    ...metaResult.directives,
    ...headerResult.directives
  ];
  const uniqueDirectives = [...new Set(allDirectives)];
  
  // Determine source
  let source: 'meta' | 'header' | 'both' | 'none' = 'none';
  if (metaResult.directives.length > 0 && headerResult.directives.length > 0) {
    source = 'both';
  } else if (metaResult.directives.length > 0) {
    source = 'meta';
  } else if (headerResult.directives.length > 0) {
    source = 'header';
  }
  
  // Determine if indexable (not indexable if noindex found in either source)
  const indexable = !metaResult.hasNoIndex && !headerResult.hasNoIndex;
  
  // Get status description
  const indexabilityStatus = getIndexabilityStatus(uniqueDirectives);
  
  // Build details
  let details = '';
  if (metaResult.directives.length > 0) {
    details += `Meta: ${metaResult.directives.join(', ')}`;
  }
  if (headerResult.directives.length > 0) {
    if (details) details += '; ';
    details += `Header: ${headerResult.directives.join(', ')}`;
  }
  
  return {
    indexable,
    indexabilityStatus,
    source,
    directives: uniqueDirectives,
    xRobotsTag: headerResult.rawValue,
    details: details || undefined
  };
}
