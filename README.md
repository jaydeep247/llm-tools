# 🚀 Contentlytics - Enterprise Content Analytics & AEO Intelligence Platform

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Status](https://img.shields.io/badge/Status-Production%20Ready-success.svg)

**Enterprise-grade website crawler and AI-powered AEO analysis platform** built with TypeScript, Crawlee, FastAPI, and OpenAI. Discover all pages on any site, analyze SEO/AEO metrics, generate Schema.org markup, and gain competitive intelligence.

---

## 📁 Project Structure

```
llm-tools/
├── frontend/              # React + Vite frontend application
│   ├── components/        # React components
│   ├── contexts/          # React contexts
│   ├── router/            # React Router configuration
│   ├── package.json       # Frontend dependencies
│   ├── vite.config.ts     # Vite configuration
│   ├── tsconfig.json      # TypeScript configuration
│   ├── Dockerfile         # Frontend Docker build
│   └── nginx.conf         # Nginx configuration
│
├── node-backend/          # Node.js + TypeScript backend
│   ├── src/               # Backend source code
│   ├── config/            # Configuration files
│   ├── docs/              # Backend documentation
│   ├── scripts/           # Utility scripts
│   ├── storage/           # Data storage
│   ├── package.json       # Backend dependencies
│   ├── tsconfig.json      # TypeScript configuration
│   ├── nodemon.json       # Nodemon configuration
│   ├── vite.config.ts     # Vite configuration
│   └── Dockerfile         # Backend Docker build
│
├── py-backend/            # Python FastAPI backend
│   ├── app/               # Python application code
│   ├── config/            # Python configuration
│   ├── requirements.txt   # Python dependencies
│   ├── run.py             # Python entry point
│   └── Dockerfile         # Python Docker build
│
├── docker-compose.yml     # Docker orchestration
├── Dockerfile             # Root Dockerfile (if needed)
├── package.json           # Monorepo scripts
└── README.md              # This file
```

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
- ✅ Mobile alternate link detection (m.example.com)
- ✅ AMP HTML version detection
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
- **Docker** (recommended) - [Download](https://www.docker.com/)

### API Keys (Optional but Recommended)

- **Google PSI API Key** - For performance audits ([Get Key](https://developers.google.com/speed/docs/insights/v5/get-started))
- **OpenAI API Key** - For AEO analysis & schema generation ([Get Key](https://platform.openai.com/api-keys))
- **DataForSEO API** - For backlink analysis ([Get Key](https://dataforseo.com/))

---

## 📦 Installation

### Option 1: Docker (Recommended)

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd llm-tools

# 2. Start all services with Docker
npm run docker:up

# Access the application:
# Frontend: http://localhost:3000
# Backend: http://localhost:3004
# Python API: http://localhost:8000
```

### Option 2: Local Development

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd llm-tools

# 2. Install all dependencies
npm run install:all

# 3. Set up environment variables
# Create .env files in each directory (frontend, node-backend, py-backend)

# 4. Start PostgreSQL and Redis

# 5. Initialize database
cd node-backend
npm run db:setup
cd ..

# 6. Run services in separate terminals
npm run dev:frontend   # Terminal 1 - Frontend on :3000
npm run dev:backend    # Terminal 2 - Node backend on :3004
npm run dev:py         # Terminal 3 - Python API on :8000
```

### 3. Environment Configuration

#### Node Backend `.env` (node-backend/.env)

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

#### Python Backend `.env` (py-backend/.env)

```bash
# Server
HOST=0.0.0.0
PORT=8000
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

## 🎯 Available Scripts

### Root Level Commands

```bash
npm run dev:frontend      # Start frontend dev server
npm run dev:backend       # Start node backend dev server
npm run dev:py            # Start Python API
npm run docker:up         # Start all services with Docker
npm run docker:down       # Stop all Docker services
npm run docker:logs       # View Docker logs
npm run install:all       # Install all dependencies
npm run build:frontend    # Build frontend for production
npm run build:backend     # Build backend for production
```

### Frontend Commands (in frontend/ directory)

```bash
npm run dev              # Start Vite dev server
npm run build            # Build for production
npm run preview          # Preview production build
```

### Backend Commands (in node-backend/ directory)

```bash
npm run dev              # Start with nodemon
npm run start            # Start production server
npm run build            # Compile TypeScript
npm run crawl            # Run crawler
npm run seo:worker       # Start SEO worker
npm run db:setup         # Initialize database
```

### Production Mode

#### Using Docker (Recommended)
```bash
# Start all services
npm run docker:up
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
