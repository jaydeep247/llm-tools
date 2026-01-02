# 🚀 Contentlytics - Enterprise Content Analytics & AEO Intelligence Platform

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Status](https://img.shields.io/badge/Status-Production%20Ready-success.svg)

**Enterprise-grade website crawler and AI-powered AEO analysis platform** built with TypeScript, Crawlee, FastAPI, and OpenAI. Discover all pages on any site, analyze SEO/AEO metrics, generate Schema.org markup, and gain competitive intelligence.

---

## ✨ Key Features

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

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Python 3.8+** - [Download](https://www.python.org/)
- **PostgreSQL 12+** - [Download](https://www.postgresql.org/)
- **Redis** (optional, for SEO queue) - [Download](https://redis.io/)

### API Keys (Optional but Recommended)

- **Google PSI API Key** - For performance audits ([Get Key](https://developers.google.com/speed/docs/insights/v5/get-started))
- **OpenAI API Key** - For AEO analysis & schema generation ([Get Key](https://platform.openai.com/api-keys))
- **DataForSEO API** - For backlink analysis ([Get Key](https://dataforseo.com/))

---

## 📦 Installation

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd contentlytics
```

### 2. Install Dependencies

#### Node.js Dependencies
```bash
npm install
```

#### Python Dependencies (AEO API)
```bash
cd aeo-api
pip install -r requirements.txt
cd ..
```

### 3. Database Setup

#### Create PostgreSQL Database
```bash
createdb contentlytics
```

#### Run Migrations
```bash
npm run db:init
```

### 4. Environment Configuration

#### Copy Environment Templates
```bash
# Node.js environment
cp .env.example .env

# Python AEO API environment
cp aeo-api/.env.example aeo-api/.env
```

#### Configure `.env` (Node.js)

```bash
# Server
PORT=3004
CORS_ORIGIN=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=contentlytics
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Authentication (IMPORTANT: Change in production!)
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
JWT_REFRESH_SECRET=your-refresh-secret-key-minimum-32-characters

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
MAIL_FROM=noreply@yourdomain.com

# APIs
PSI_API_KEY=your_google_psi_api_key
PY_API_BASE=http://localhost:8000
```

#### Configure `aeo-api/.env` (Python)

```bash
# Server
HOST=localhost
PORT=8001
DEBUG=False

# AI API Keys
OPENAI_API_KEY=sk-your-openai-api-key
GEMINI_API_KEY=your-gemini-api-key  # Optional
CLAUDE_API_KEY=sk-ant-your-claude-api-key  # Optional

# DataForSEO
DATAFORSEO_USERNAME=your_email@example.com
DATAFORSEO_PASSWORD=your_password
```

---

## 🎯 Running the Application

### Development Mode

#### Terminal 1: Start Node.js Server
```bash
npm run dev
```

#### Terminal 2: Start Python AEO API
```bash
cd aeo-api
uvicorn app.main:app --reload --port 8001
```

#### Terminal 3: Start Frontend (if separate)
```bash
npm run dev:frontend
```

### Production Mode

#### Using PM2 (Recommended)
```bash
# Install PM2
npm install -g pm2

# Start Node.js server
pm2 start npm --name "contentlytics" -- start

# Start Python API
pm2 start "uvicorn app.main:app --host 0.0.0.0 --port 8001" --name "aeo-api" --interpreter python3

# Save PM2 configuration
pm2 save
pm2 startup
```

### Access the Application

- **Web Interface**: http://localhost:3004
- **API Documentation**: http://localhost:3004/api/docs
- **AEO API Docs**: http://localhost:8001/docs
- **Health Check**: http://localhost:3004/api/health

---

## 📚 Documentation

- **[Complete Feature Guide](CRAWL_FEATURES.md)** - All features & data points
- **[AEO API Documentation](aeo-api/README.md)** - AEO analysis details
- **[Schema Generator Guide](aeo-api/SCHEMA_GENERATOR_README.md)** - Schema markup generation
- **[Competitor Analysis](aeo-api/COMPETITOR_ANALYSIS_README.md)** - Backlink analysis

---

## 🏗️ Architecture

```
contentlytics/
├── src/                    # Node.js/TypeScript backend
│   ├── routes/            # API routes
│   ├── database/          # Database layer (PostgreSQL)
│   ├── crawler/           # Web crawler logic
│   ├── audits/            # Performance audits
│   ├── auth/              # Authentication & authorization
│   └── frontend/          # React frontend
├── aeo-api/               # Python FastAPI service
│   ├── app/
│   │   ├── routes/        # AEO API routes
│   │   └── services/      # AI services (OpenAI, Gemini, Claude)
│   └── requirements.txt
├── config/                # Configuration files
└── storage/               # Data storage
```

---

## 🔒 Security Features

- ✅ JWT-based authentication with refresh tokens
- ✅ Role-based access control (RBAC)
- ✅ Secure password hashing (bcrypt)
- ✅ Environment variable validation
- ✅ SQL injection prevention (parameterized queries)
- ✅ CORS protection
- ✅ Rate limiting
- ✅ Secure session management

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

---

## 🚀 Deployment

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d
```

### Manual Deployment

1. **Set up production environment variables**
2. **Build the application**
   ```bash
   npm run build
   ```
3. **Start with PM2**
   ```bash
   pm2 start ecosystem.config.js
   ```
4. **Set up reverse proxy (Nginx)**
5. **Configure SSL/TLS certificates**

---

## 📊 Performance

- **Crawl Speed**: Up to 150 concurrent requests
- **Database**: PostgreSQL with connection pooling
- **Caching**: Redis-based caching for SEO data
- **API Response Time**: < 100ms average
- **Scalability**: Horizontal scaling supported

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🆘 Support

For questions or support:
- 📧 Email: support@yourdomain.com
- 📝 [Create an Issue](https://github.com/your-org/contentlytics/issues)
- 💬 [Discussions](https://github.com/your-org/contentlytics/discussions)

---

## 🙏 Acknowledgments

Built with:
- [Crawlee](https://crawlee.dev/) - Web scraping framework
- [FastAPI](https://fastapi.tiangolo.com/) - Python web framework
- [OpenAI](https://openai.com/) - AI-powered analysis
- [PostgreSQL](https://www.postgresql.org/) - Database
- [React](https://react.dev/) - Frontend framework

---

**Built with ❤️ for SEO & AEO Professionals**

---

## 🔄 Changelog

### v1.0.0 (2026-01-01)
- ✅ Initial production release
- ✅ Full web crawling capabilities
- ✅ AEO analysis integration
- ✅ Performance audits
- ✅ Schema generation
- ✅ Backlink analysis
- ✅ User authentication & authorization
- ✅ Production-ready security features
