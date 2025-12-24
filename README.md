# 🚀 Contentlytics - Content Analytics & AEO Intelligence Platform

**Fast website crawler and AI-powered AEO analysis platform** built with TypeScript, Crawlee, FastAPI, and OpenAI. Discover all pages on any site, analyze SEO/AEO metrics, generate Schema.org markup, and gain competitive intelligence.

---

## ✨ Features

### 🕷️ **Powerful Web Crawling**
- ✅ No depth limit - crawls entire site structure
- ✅ High-speed parallel crawling (up to 150 concurrent requests)
- ✅ Sitemap seeding for faster discovery
- ✅ robots.txt compliant
- ✅ Duplicate URL detection
- ✅ Smart URL filtering (UTM params, session IDs)

### 📊 **Comprehensive SEO Analysis**
- ✅ Title & meta description analysis
- ✅ Heading structure (H1-H6)
- ✅ Image optimization (alt text, sizes)
- ✅ Internal/external link analysis
- ✅ Canonical tag verification
- ✅ Broken link detection
- ✅ Duplicate content identification
- ✅ Structured data (Schema.org) validation

### 🤖 **AEO (Answer Engine Optimization)**
- ✅ AI bot access analysis (GPTBot, ClaudeBot, Google-Extended, etc.)
- ✅ Content answerability scoring
- ✅ Knowledge base optimization
- ✅ Entity recognition
- ✅ Question pattern detection
- ✅ Featured snippet optimization
- ✅ AI citation readiness

### ⚡ **Performance Audits**
- ✅ Core Web Vitals (LCP, FID, CLS)
- ✅ Google PageSpeed Insights integration
- ✅ Mobile & desktop performance
- ✅ Performance score (0-100)
- ✅ Optimization recommendations

### 🎯 **AI-Powered Schema Generation**
- ✅ 10 Schema.org types (Organization, LocalBusiness, Article, Product, etc.)
- ✅ GPT-4o-mini powered extraction
- ✅ Real data extraction (no placeholders)
- ✅ Copy-paste ready JSON-LD markup
- ✅ Address, contact, and social media detection

### 🏆 **Competitor Backlink Analysis**
- ✅ Comprehensive backlink metrics (DataForSEO)
- ✅ Domain authority & page authority
- ✅ Dofollow/nofollow ratio
- ✅ Backlink quality scoring
- ✅ Geographic distribution
- ✅ Top referring domains

---

## 📖 **Complete Feature Guide**

👉 **[View Complete Feature & Data Extraction Guide](CRAWL_FEATURES.md)**

See exactly what data can be extracted, what audits are performed, and how each feature works.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **Python 3.8+** (for AEO API)
- **Google PSI API Key** (optional, for performance audits)
- **OpenAI API Key** (optional, for AEO analysis & schema generation)
- **DataForSEO API Key** (optional, for backlink analysis)

### Installation

```bash
# 1. Clone repository
git clone <your-repo-url>
cd contentlytics

# 2. Install Node.js dependencies
npm install

# 3. Install Python dependencies (for AEO API)
cd aeo-api
pip install -r requirements.txt
cd ..
```

### Configuration

Create a `.env` file in the root directory:

```bash
# ====================================
# Crawler Configuration
# ====================================
CRAWL_MAX_CONCURRENCY=150
CRAWL_PER_HOST_DELAY_MS=150
ALLOW_SUBDOMAINS=false
DENY_PARAMS=utm_,session,sort,filter,ref,fbclid,gclid

# ====================================
# Google PageSpeed Insights (Optional)
# ====================================
PSI_API_KEY=your_google_psi_api_key

# ====================================
# OpenAI API (For AEO & Schema Gen)
# ====================================
OPENAI_API_KEY=your_openai_api_key

# ====================================
# DataForSEO (For Backlink Analysis)
# ====================================
DATAFORSEO_USERNAME=your_dataforseo_email
DATAFORSEO_PASSWORD=your_dataforseo_password
```

### Running the Platform

#### Option 1: Using the Web Interface (Recommended)

```bash
# Terminal 1: Start the main crawler server
npm run dev

# Terminal 2: Start the AEO API
cd aeo-api
uvicorn app.main:app --reload --port 8000

# Open browser at: http://localhost:3000
```

#### Option 2: Command Line Crawling

```bash
# Basic crawl
npm run crawl -- https://example.com

# Crawl with audits
npm run crawl -- https://example.com --audits

# Crawl with specific concurrency
npm run crawl -- https://example.com --concurrency 100
```

---

## 📊 What Data Gets Extracted?

### From Crawling:
- ✅ **Page URLs** - All discovered pages
- ✅ **Page Titles** - `<title>` tags
- ✅ **Meta Descriptions** - SEO descriptions
- ✅ **Headings (H1-H6)** - Content structure
- ✅ **Images** - URLs, alt text, dimensions
- ✅ **Links** - Internal, external, anchor text
- ✅ **Status Codes** - HTTP response codes
- ✅ **Response Times** - Page load speeds
- ✅ **Word Count** - Content length
- ✅ **Content Type** - MIME types

### From SEO Analysis:
- ✅ **Title/Description Issues** - Too short/long, missing, duplicates
- ✅ **Heading Problems** - Missing H1, multiple H1s
- ✅ **Image Issues** - Missing alt text
- ✅ **Link Problems** - Broken links, redirect chains
- ✅ **Canonical Issues** - Duplicate content
- ✅ **Indexability** - Robots meta, canonical tags

### From AEO Analysis:
- ✅ **AI Bot Access** - Permission status for 15+ AI bots
- ✅ **Answerability Score** - How well content answers questions
- ✅ **Knowledge Base Score** - Entity and topic clarity
- ✅ **Crawler Accessibility** - Meta robots, canonical, alt text
- ✅ **Structured Data** - Schema.org implementation quality

### From Performance Audits:
- ✅ **Core Web Vitals** - LCP, FID, CLS
- ✅ **Performance Score** - Overall score (0-100)
- ✅ **Speed Metrics** - FCP, TTI, Speed Index
- ✅ **Opportunities** - Optimization suggestions
- ✅ **Diagnostics** - Performance issues

### From Competitor Analysis:
- ✅ **Backlink Count** - Total backlinks
- ✅ **Referring Domains** - Unique domains
- ✅ **Authority Metrics** - Domain/page rank
- ✅ **Quality Score** - Backlink quality (0-100)
- ✅ **Link Details** - Source, anchor, type
- ✅ **Geographic Data** - Country distribution

---

## 📁 Output & Storage

### Database (SQLite)
- All crawled data stored in: `storage/crawler.db`
- Query directly with SQL
- Persistent across sessions

### Export Formats
- **JSON** - Machine-readable
- **CSV** - Spreadsheet-compatible
- **JSON Lines** - Stream processing

### Data Access
- **Web UI** - Browse and filter results
- **REST API** - Programmatic access
- **Direct SQL** - Advanced queries

---

## 🛠️ Configuration Files

- **`config/audits.json`** - Performance audit settings
- **`config/seo.json`** - SEO analysis rules
- **`.env`** - Environment variables & API keys

---

## 📚 Documentation

- **[Complete Feature Guide](CRAWL_FEATURES.md)** - All features & data points
- **[AEO API Documentation](aeo-api/README.md)** - AEO analysis details
- **[Schema Generator Guide](aeo-api/SCHEMA_GENERATOR_README.md)** - Schema markup generation
- **[Competitor Analysis](aeo-api/COMPETITOR_ANALYSIS_README.md)** - Backlink analysis

---

## 🎯 Use Cases

### For SEO Professionals
- Comprehensive site audits
- Technical SEO issue detection
- Competitor backlink research
- Content gap analysis

### For Content Marketers
- Content inventory management
- Topic coverage analysis
- AI optimization insights
- Schema markup generation

### For Web Developers
- Performance monitoring
- Broken link detection
- Technical issue identification
- Site structure visualization

### For Business Owners
- Website health checks
- SEO improvement recommendations
- Competitor analysis
- AI presence assessment

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

## 📄 License

[Your License Here]

---

## 📧 Support

For questions or support, please [create an issue](https://github.com/your-repo/issues)

---

**Built with ❤️ for SEO & AEO Professionals**


