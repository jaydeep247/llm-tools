# 🏗️ System Architecture

This document describes the architecture of the Contentlytics platform.

---

## 📊 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Browser    │  │  Mobile App  │  │   API Client │      │
│  │  (React UI)  │  │   (Future)   │  │  (External)  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Nginx Reverse  │
                    │     Proxy       │
                    └────────┬────────┘
                             │
          ┌──────────────────┴──────────────────┐
          │                                     │
┌─────────▼──────────┐              ┌──────────▼─────────┐
│   Node.js Server   │              │   Python AEO API   │
│  (TypeScript/TS)   │◄────────────►│    (FastAPI)       │
│                    │              │                    │
│  ┌──────────────┐  │              │  ┌──────────────┐  │
│  │   Routes     │  │              │  │  AI Services │  │
│  │   (API)      │  │              │  │  - OpenAI    │  │
│  └──────────────┘  │              │  │  - Gemini    │  │
│  ┌──────────────┐  │              │  │  - Claude    │  │
│  │   Services   │  │              │  └──────────────┘  │
│  │  - Crawler   │  │              │  ┌──────────────┐  │
│  │  - Audits    │  │              │  │  DataForSEO  │  │
│  │  - SEO       │  │              │  │   Client     │  │
│  └──────────────┘  │              │  └──────────────┘  │
│  ┌──────────────┐  │              └────────────────────┘
│  │     Auth     │  │
│  │   (JWT)      │  │
│  └──────────────┘  │
└─────────┬──────────┘
          │
          │
┌─────────▼──────────────────────────────────────┐
│              Data Layer                        │
│  ┌──────────────┐  ┌──────────────┐           │
│  │  PostgreSQL  │  │    Redis     │           │
│  │   Database   │  │  (Optional)  │           │
│  │              │  │              │           │
│  │  - Users     │  │  - SEO Queue │           │
│  │  - Sessions  │  │  - Cache     │           │
│  │  - Pages     │  │              │           │
│  │  - Audits    │  │              │           │
│  └──────────────┘  └──────────────┘           │
└────────────────────────────────────────────────┘
```

---

## 🔧 Component Details

### 1. Frontend (React)
- **Location**: `src/frontend/`
- **Technology**: React, TypeScript, Vite
- **Styling**: Tailwind CSS
- **State Management**: React hooks
- **API Communication**: Fetch API with JWT authentication

### 2. Node.js Backend
- **Location**: `src/`
- **Technology**: Express.js, TypeScript
- **Key Components**:
  - **Routes**: API endpoints
  - **Services**: Business logic
  - **Database**: PostgreSQL repositories
  - **Auth**: JWT-based authentication
  - **Crawler**: Web crawling engine (Crawlee)
  - **Audits**: Performance analysis
  - **Scheduler**: Automated tasks

### 3. Python AEO API
- **Location**: `aeo-api/`
- **Technology**: FastAPI, Python 3.8+
- **Key Components**:
  - **AI Services**: OpenAI, Gemini, Claude integration
  - **Schema Generator**: AI-powered schema extraction
  - **Competitor Analysis**: DataForSEO integration
  - **AEO Scoring**: Content analysis

### 4. Database (PostgreSQL)
- **Tables**:
  - `users` - User accounts
  - `crawl_sessions` - Crawl metadata
  - `pages` - Crawled pages
  - `resources` - Page resources
  - `links` - Internal/external links
  - `audits` - Performance audit results
  - `schedules` - Scheduled crawls

### 5. Redis (Optional)
- **Purpose**: SEO processing queue
- **Usage**: Async job processing

---

## 🔄 Data Flow

### Crawl Process
```
1. User initiates crawl
   ↓
2. Create session in DB
   ↓
3. Start crawler (Crawlee)
   ↓
4. Discover URLs (sitemap + crawl)
   ↓
5. Extract page data
   ↓
6. Store in PostgreSQL
   ↓
7. Send SSE updates to client
   ↓
8. Optional: Run audits
   ↓
9. Complete session
```

### Authentication Flow
```
1. User login request
   ↓
2. Validate credentials (bcrypt)
   ↓
3. Generate JWT tokens
   ↓
4. Return access + refresh tokens
   ↓
5. Client stores tokens
   ↓
6. Include in API requests
   ↓
7. Middleware validates JWT
   ↓
8. Grant/deny access
```

---

## 🔐 Security Architecture

### Authentication
- JWT-based with refresh tokens
- Bcrypt password hashing (10 rounds)
- Secure cookie storage

### Authorization
- Role-based access control (RBAC)
- User/Admin roles
- Resource ownership validation

### Data Protection
- Parameterized SQL queries
- Environment variable validation
- CORS protection
- Rate limiting

---

## 📡 API Architecture

### REST API Endpoints
- `/api/auth/*` - Authentication
- `/api/crawl/*` - Crawl management
- `/api/data/*` - Data retrieval
- `/api/audits/*` - Audit management
- `/api/schedules/*` - Schedule management
- `/api/users/*` - User management

### Real-time Communication
- Server-Sent Events (SSE) for live updates
- `/events` endpoint for SSE connection

---

## 🚀 Scalability Considerations

### Horizontal Scaling
- Stateless Node.js servers
- Load balancer (Nginx)
- Shared PostgreSQL database
- Redis for session storage

### Performance Optimization
- Database connection pooling
- Redis caching
- CDN for static assets
- Gzip compression

---

## 📦 Deployment Architecture

### Production Setup
```
┌─────────────────────────────────────┐
│         Load Balancer (Nginx)       │
└───────────┬─────────────────────────┘
            │
    ┌───────┴───────┐
    │               │
┌───▼────┐     ┌───▼────┐
│ Node 1 │     │ Node 2 │
│ (PM2)  │     │ (PM2)  │
└───┬────┘     └───┬────┘
    │              │
    └──────┬───────┘
           │
    ┌──────▼──────┐
    │ PostgreSQL  │
    │  (Primary)  │
    └─────────────┘
```

---

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Crawler**: Crawlee
- **Database**: PostgreSQL 12+
- **ORM**: Custom repositories
- **Authentication**: JWT, bcrypt

### Python Service
- **Framework**: FastAPI
- **AI**: OpenAI, Google Gemini, Anthropic Claude
- **HTTP Client**: httpx
- **Validation**: Pydantic

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Language**: TypeScript

### Infrastructure
- **Process Manager**: PM2
- **Reverse Proxy**: Nginx
- **SSL**: Let's Encrypt
- **Cache**: Redis (optional)

---

## 📊 Performance Metrics

- **Crawl Speed**: 150 concurrent requests
- **API Response**: <100ms average
- **Database Queries**: <50ms average
- **SSE Latency**: <10ms
- **Uptime Target**: 99.9%

---

**Last Updated:** 2026-01-01
