import React from 'react';

interface SchemaGeneratorProps {
  url: string;
  schemaData: any;
  schemaLoading: boolean;
  schemaError: string | null;
  copiedSchema: boolean;
  schemaFormat: 'json-ld' | 'rdfa';
  selectedSchemaType: string;
  setSchemaFormat: (format: 'json-ld' | 'rdfa') => void;
  setSelectedSchemaType: (type: string) => void;
  generateSchema: () => void;
  copySchemaToClipboard: () => void;
}

const SchemaGenerator: React.FC<SchemaGeneratorProps> = ({
  url,
  schemaData,
  schemaLoading,
  schemaError,
  copiedSchema,
  schemaFormat,
  selectedSchemaType,
  setSchemaFormat,
  setSelectedSchemaType,
  generateSchema,
  copySchemaToClipboard
}) => {
  return (
    <div className="schema-generator-content">
      <div className="content-header">
        <div>
          <h3>📝 Schema.org Markup Generator</h3>
          <p>Generate SEO-optimized Schema.org JSON-LD markup using AI</p>
        </div>
        <button
          className="action-button primary"
          onClick={generateSchema}
          disabled={schemaLoading || !url}
        >
          {schemaLoading ? '⏳ Generating...' : '✨ Generate Schema'}
        </button>
      </div>

      <div className="schema-type-selector">
        <label htmlFor="schema-type" className="schema-type-label">
          Select Schema Type:
        </label>
        <select
          id="schema-type"
          className="schema-type-dropdown"
          value={selectedSchemaType}
          onChange={(e) => setSelectedSchemaType(e.target.value)}
          disabled={schemaLoading}
        >
          <option value="auto">🤖 Auto-detect (Recommended)</option>
          <option value="Organization">🏢 Organization Markup</option>
          <option value="LocalBusiness">🏪 Local Business Markup</option>
          <option value="WebPage">📄 WebPage Markup</option>
          <option value="Article">📰 Article Markup</option>
          <option value="BlogPosting">✍️ Blog Post Markup</option>
          <option value="Product">🛍️ Product Markup</option>
          <option value="Service">⚙️ Service Markup</option>
          <option value="FAQPage">❓ FAQ Markup</option>
          <option value="BreadcrumbList">🍞 Breadcrumb Markup</option>
          <option value="Person">👤 Person Markup</option>
          <option value="Event">📅 Event Markup</option>
          <option value="Recipe">🍳 Recipe Markup</option>
          <option value="HowTo">📖 How To Markup</option>
          <option value="VideoObject">🎥 Video Markup</option>
          <option value="ImageObject">🖼️ Image Markup</option>
          <option value="Course">🎓 Course Markup</option>
          <option value="JobPosting">💼 Job Posting Markup</option>
          <option value="Review">⭐ Review Markup</option>
        </select>
      </div>

      {schemaError && (
        <div className="schema-error">
          <div className="error-icon">⚠️</div>
          <div>
            <h4>Error Generating Schema</h4>
            <p>{schemaError}</p>
          </div>
        </div>
      )}

      {schemaLoading && (
        <div className="schema-loading">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Analyzing page content and generating schema markup...</p>
          </div>
        </div>
      )}

      {schemaData && !schemaLoading && (
        <div className="schema-results">
          <div className="schema-code-card">
            <div className="schema-code-header">
              <div className="schema-header-left">
                <h4>Schema Markup</h4>
                <div className="schema-format-toggle">
                  <button
                    className={`format-button ${schemaFormat === 'json-ld' ? 'active' : ''}`}
                    onClick={() => setSchemaFormat('json-ld')}
                  >
                    JSON-LD
                  </button>
                  <button
                    className={`format-button ${schemaFormat === 'rdfa' ? 'active' : ''}`}
                    onClick={() => setSchemaFormat('rdfa')}
                  >
                    RDFa
                  </button>
                </div>
              </div>
              <button
                className="copy-button"
                onClick={copySchemaToClipboard}
              >
                {copiedSchema ? '✅ Copied!' : '📋 Copy to Clipboard'}
              </button>
            </div>
            <div className="schema-code-container">
              <pre className="schema-code">
                <code>
                  {schemaFormat === 'json-ld'
                    ? (schemaData.schema_text ?? schemaData.schemaText ?? schemaData.json_ld ?? '')
                    : (schemaData.rdfa_markup ?? schemaData.rdfaMarkup ?? schemaData.rdfa ?? '')}
                </code>
              </pre>
            </div>
          </div>
        </div>
      )}

      {!schemaData && !schemaLoading && !schemaError && (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <h3>Generate Schema Markup</h3>
          <p>
            Click the "Generate Schema" button above to create SEO-optimized Schema.org markup for your page.
            <br /><br />
            Our AI will analyze your page content and generate the most appropriate schema type
            (Article, Product, LocalBusiness, Organization, etc.) with all relevant properties.
          </p>
          <div className="empty-state-hint">
            💡 Make sure your OpenAI API key is configured for AI-powered schema generation
          </div>
        </div>
      )}
    </div>
  );
};

export default SchemaGenerator;