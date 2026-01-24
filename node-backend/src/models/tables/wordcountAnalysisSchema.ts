export const wordcountAnalysisSchema = `
-- Wordcount Analysis table
-- Stores word count analysis results for pages
CREATE TABLE IF NOT EXISTS wordcount_analysis (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    total_word_count INTEGER DEFAULT NULL, -- Total number of words in the page's HTML text (excluding script, style, noscript tags)
    visible_word_count INTEGER DEFAULT NULL, -- Number of words actually visible to users (main content)
    unique_word_count INTEGER DEFAULT NULL, -- Number of distinct words used in visible content
    text_to_html_ratio NUMERIC(5, 2) DEFAULT NULL, -- Percentage of text content compared to total HTML size
    sentence_count INTEGER DEFAULT NULL, -- Number of sentences in visible text
    paragraph_count INTEGER DEFAULT NULL, -- Number of paragraph-level text blocks
    average_sentence_length NUMERIC(5, 2) DEFAULT NULL, -- Average number of words per sentence
    average_paragraph_length NUMERIC(5, 2) DEFAULT NULL, -- Average number of words per paragraph
    keyword_density NUMERIC(5, 2) DEFAULT NULL, -- Keyword density percentage (optional, for target keyword)
    thin_content BOOLEAN DEFAULT NULL, -- Whether page has thin content (low word count or low uniqueness)
    thin_content_reason TEXT DEFAULT NULL, -- Reason for thin content: 'Low word count' or 'Low uniqueness'
    duplicate_content BOOLEAN DEFAULT NULL, -- Whether page content is duplicate of another page
    duplicate_with_urls JSONB DEFAULT NULL, -- Array of URLs that have duplicate content
    section_word_count_mapping JSONB DEFAULT NULL, -- Mapping of section headings to word counts
    section_word_count_breakdown JSONB DEFAULT NULL, -- Percentage distribution of words across sections
    heading_word_count_mapping JSONB DEFAULT NULL, -- Mapping of headings (H1-H6) to word counts under each heading
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(page_id, session_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_page_id ON wordcount_analysis (page_id);
CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_session_id ON wordcount_analysis (session_id);
CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_total_word_count ON wordcount_analysis (total_word_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_visible_word_count ON wordcount_analysis (visible_word_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_session_word_count ON wordcount_analysis (session_id, visible_word_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_thin_content ON wordcount_analysis (thin_content) WHERE thin_content = true;
CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_duplicate_content ON wordcount_analysis (duplicate_content) WHERE duplicate_content = true;

-- Add comments for documentation
COMMENT ON TABLE wordcount_analysis IS 'Stores word count analysis results for crawled pages';
COMMENT ON COLUMN wordcount_analysis.total_word_count IS 'Total number of words in the page HTML text (excluding script, style, noscript tags)';
COMMENT ON COLUMN wordcount_analysis.visible_word_count IS 'Number of words actually visible to users (main content)';
COMMENT ON COLUMN wordcount_analysis.unique_word_count IS 'Number of distinct words used in visible content';
COMMENT ON COLUMN wordcount_analysis.text_to_html_ratio IS 'Percentage of text content compared to total HTML size';
COMMENT ON COLUMN wordcount_analysis.sentence_count IS 'Number of sentences in visible text';
COMMENT ON COLUMN wordcount_analysis.paragraph_count IS 'Number of paragraph-level text blocks';
COMMENT ON COLUMN wordcount_analysis.average_sentence_length IS 'Average number of words per sentence';
COMMENT ON COLUMN wordcount_analysis.average_paragraph_length IS 'Average number of words per paragraph';
COMMENT ON COLUMN wordcount_analysis.keyword_density IS 'Keyword density percentage (optional, for target keyword)';
COMMENT ON COLUMN wordcount_analysis.thin_content IS 'Whether page has thin content (low word count or low uniqueness)';
COMMENT ON COLUMN wordcount_analysis.thin_content_reason IS 'Reason for thin content: Low word count or Low uniqueness';
COMMENT ON COLUMN wordcount_analysis.duplicate_content IS 'Whether page content is duplicate of another page';
COMMENT ON COLUMN wordcount_analysis.duplicate_with_urls IS 'Array of URLs that have duplicate content';
COMMENT ON COLUMN wordcount_analysis.section_word_count_mapping IS 'Mapping of section headings to word counts';
COMMENT ON COLUMN wordcount_analysis.section_word_count_breakdown IS 'Percentage distribution of words across sections';
COMMENT ON COLUMN wordcount_analysis.heading_word_count_mapping IS 'Mapping of headings (H1-H6) to word counts under each heading';
`;
