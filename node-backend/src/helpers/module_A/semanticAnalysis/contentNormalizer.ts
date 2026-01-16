/**
 * Content Normalizer
 * Extracts and normalizes main visible content from pages
 * Removes noise: navigation, footer, sidebar, scripts, styles
 */

export interface NormalizedContent {
  text: string;
  wordCount: number;
  cleaned: boolean;
}

/**
 * Extract main visible content from HTML
 * Removes: script tags, style tags, navigation, footer, boilerplate
 */
export function extractMainContent(htmlContent: string): string {
  try {
    // Remove script and style tags
    let content = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');

    // Remove common navigation/footer patterns
    content = content
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ');

    // Remove HTML tags
    content = content.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    content = decodeHtmlEntities(content);

    // Normalize whitespace
    content = normalizeWhitespace(content);

    return content;
  } catch (error) {
    console.error('Error extracting main content:', error);
    return '';
  }
}

/**
 * Normalize text content
 */
export function normalizeContent(content: string): NormalizedContent {
  try {
    // Lowercase
    let normalized = content.toLowerCase();

    // Remove extra whitespace
    normalized = normalizeWhitespace(normalized);

    // Optional: Remove common stopwords (can be disabled for better context)
    // For now, keeping full content for better semantic understanding
    
    return {
      text: normalized,
      wordCount: normalized.split(/\s+/).filter(word => word.length > 0).length,
      cleaned: true
    };
  } catch (error) {
    console.error('Error normalizing content:', error);
    return {
      text: '',
      wordCount: 0,
      cleaned: false
    };
  }
}

/**
 * Normalize whitespace: remove extra spaces, tabs, newlines
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };

  let decoded = text;
  Object.entries(entities).forEach(([entity, char]) => {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  });

  return decoded;
}

/**
 * Check if content is meaningful for vectorization
 */
export function isContentMeaningful(content: string, minLength: number = 20): boolean {
  const normalized = normalizeWhitespace(content);
  const isValid = normalized.length >= minLength;
  if (!isValid) {
    console.log(`[SemanticAnalysis] Content too short: ${normalized.length} < ${minLength}`);
  }
  return isValid;
}
