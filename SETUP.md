# 🚀 Quick Setup Guide - Docker Installation

This guide will help you set up and run the Contentlytics application using Docker.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Docker** (version 20.10 or higher) - [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** (version 2.0 or higher) - Usually comes with Docker Desktop
- **Git** - [Install Git](https://git-scm.com/downloads)

Verify installations:
```bash
docker --version
docker-compose --version
git --version
```

---

## 🔧 Setup Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
cd llm-tools
```

### 2. Create Environment File

Create a `.env` file in the root directory with the following configuration:

```bash
cp .env.example .env  # If .env.example exists
# OR create .env manually
nano .env
```

**Required Environment Variables:**

```env
# Application
NODE_ENV=production
PORT=3004
DEBUG=False

# Database Configuration
# For local Docker Postgres (default)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/contentlytics
DB_ENVIRONMENT=local

# For Cloud Database (optional)
# DATABASE_URL=postgresql://user:password@host:5432/database
# DB_ENVIRONMENT=cloud

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here

# JWT Secrets (CHANGE THESE!)
JWT_SECRET=your_jwt_secret_key_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
COOKIE_SECURE=false

# CORS Configuration
CORS_ORIGIN=http://localhost
PUBLIC_IP=http://localhost

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
MAIL_FROM=your_email@gmail.com
MAIL_TO=admin@example.com

# AI API Keys
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
CLAUDE_API_KEY=your_claude_api_key
PSI_API_KEY=your_pagespeed_insights_api_key

# DataForSEO Configuration
DATAFORSEO_USERNAME=your_username
DATAFORSEO_PASSWORD=your_password
DATAFORSEO_USERNAME_ENC=encrypted_username
DATAFORSEO_PASSWORD_ENC=encrypted_password
DATAFORSEO_MASTER_KEY=your_master_key

# Python API Configuration
PY_API_BASE=http://aeo-api:8000
AEO_API_BASE_URL=http://aeo-api:8000

# Audit Configuration (optional)
AUDIT_CONCURRENCY=100
```

> **⚠️ Important:** Replace all placeholder values (especially JWT secrets and API keys) with your actual credentials.

### 3. Configure Database Environment

The docker-compose.yml now supports both local and cloud databases automatically based on your `.env` configuration.

**Option A: Local PostgreSQL (Recommended for development)**

Set in your `.env` file:
```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/contentlytics
DB_ENVIRONMENT=local
```

**Option B: Cloud Database (e.g., Neon DB, AWS RDS)**

Set in your `.env` file:
```env
DATABASE_URL=postgresql://user:password@your-cloud-host:5432/database
DB_ENVIRONMENT=cloud
```

---

## 🚀 Running the Application

### Start All Services

**For Local PostgreSQL:**
```bash
# Start with local PostgreSQL database
docker-compose --profile local up -d
```

**For Cloud Database:**
```bash
# Start without local PostgreSQL (using cloud DB)
docker-compose up -d
```

**To see logs while starting:**
```bash
# Local setup
docker-compose --profile local up

# Cloud setup
docker-compose up

# Press Ctrl+C to stop
```

### Check Service Status

```bash
# For local setup
docker-compose --profile local ps

# For cloud setup
docker-compose ps
```

You should see these services running:
- `contentlytics-db` (PostgreSQL - **only if using local setup**)
- `contentlytics-redis` (Redis)
- `contentlytics-aeo-api` (Python API)
- `contentlytics-backend` (Node.js API)
- `contentlytics-frontend` (React Frontend)
- `contentlytics-seo-worker` (SEO Worker)
- `contentlytics-audit-worker` (Audit Worker)

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f aeo-api
```

### Access the Application

Once all services are running, open your browser:

- **Frontend:** http://localhost
- **Backend API:** http://localhost:3004
- **Python AEO API:** http://localhost:8000

---

# For local setup
docker-compose --profile local down

# For cloud setup
docker-compose down
```

### Stop and Remove Volumes (⚠️ Deletes all data)
```bash
# For local setup
docker-compose --profile local down -v

# For cloud setup (only removes redis data)
docker-compose down -v
```

### Restart Services
```bash
# For local setup
docker-compose --profile local restart

# For cloud setup
docker-compose restart
```

### Restart Specific Service
```bash
docker-compose restart backend
```

### Rebuild Services (after code changes)
```bash
# For local setup
docker-compose --profile local up -d --build

# For cloud setupcompose restart backend
```

### Rebuild Services (after code changes)
```bash
docker-compose up -d --build
```

### Rebuild Specific Service
```bash
docker-compose up -d --build backend
```

### Execute Commands in Container
```bash
# Access backend shell
docker-compose exec backend sh

# Access PostgreSQL
docker-compose exec postgres psql -U postgres -d contentlytics

# Run database migrations
docker-compose exec backend npx prisma migrate deploy
```

### View Resource Usage
```bash
docker stats
```

---

## 🔍 Database Initialization

The application automatically runs database migrations on startup. However, if you need to manually initialize:

```bash
# Run Prisma migrations
docker-compose exec backend npx prisma migrate deploy

# Generate Prisma client
docker-compose exec backend npx prisma generate

# Seed database (if seed script exists)
docker-compose exec backend npm run seed
```

---

## 🐛 Troubleshooting

### Services Won't Start

1. **Check if ports are already in use:**
   ```bash
   # Check port 80
   lsof -i :80
   
   # Check port 5432 (PostgreSQL)
   lsof -i :5432
   
   # Check port 6379 (Redis)
**For Local PostgreSQL:**
```bash
# Check if PostgreSQL is healthy
docker-compose --profile local ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres pg_isready -U postgres
```

**For Cloud Database:**
- Verify your `DATABASE_URL` in `.env` is correct
- Check if your IP is whitelisted in cloud provider
- Test connection from your local machine first```bash
   docker system prune -a
   docker volume prune
   ```

### Database Connection Issues

```bash
# Check if PostgreSQL is healthy
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres pg_isready -U postgres
```

### Redis Connection Issues

```bash
# Check Redis
**For Local Setup:**
```bash
# Stop and remove everything
docker-compose --profile local down -v

# Remove all images
docker-compose rm -f

# Rebuild and start
docker-compose --profile local up -d --build
```

**For Cloud Setup:**
docker-compose logs redis

# Test Redis connection
docker-compose exec redis redis-cli -a your_redis_password ping
```

### Application Errors

```bash
# Check backend logs
docker-compose logs -f backend

# Check frontend logs
docker-compose logs -f frontend

# Check worker logs
docker-compose logs -f seo-worker
docker-compose logs -f audit-worker
```

### Rebuild Everything from Scratch

```bash
# Stop and remove everything
docker-compose down -v

# Remove all images
docker-compose rm -f

# Rebuild and start
docker-compose up -d --build
```

---

## 📦 Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                     │
│                      http://localhost:80                     │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────┐
│                    Backend API (Node.js)                     │
│                    http://localhost:3004                     │
└───┬────────────────────────┬───────────────────────┬────────┘
    │                        │                       │
┌───▼──────┐    ┌───────────▼────────┐    ┌────────▼────────┐
│PostgreSQL│    │   Python AEO API   │    │      Redis      │
│  :5432   │    │      :8000         │    │     :6379       │
└──────────┘    └────────────────────┘    └─────────┬───────┘
                                                     │
                                    ┌────────────────┴─────────┐
                                    │                          │
                              ┌─────▼──────┐          ┌───────▼────────┐
                              │ SEO Worker │          │ Audit Worker   │
                              └────────────┘          └────────────────┘
```

---

## 🔐 Security Notes

- **Never commit `.env` file** to version control
- Change default JWT secrets in production
- Use strong passwords for database and Redis
- Enable HTTPS/SSL in production
- Keep API keys secure and rotate regularly

---

## 📚 Additional Resources

**For Local Setup:**
- [ ] Docker and Docker Compose installed
- [ ] Repository cloned
- [ ] `.env` file created with `DB_ENVIRONMENT=local`
- [ ] Services started with `docker-compose --profile local up -d`
- [ ] All services showing as "healthy"
- [ ] Frontend accessible at http://localhost
- [ ] Backend API responding at http://localhost:3004
- [ ] No errors in logs

**For Cloud Setup:**
- [ ] Docker and Docker Compose installed
- [ ] Repository cloned
- [ ] `.env` file created with `DB_ENVIRONMENT=cloud` and valid `DATABASE_URL`
- [ ] Cloud database accessible and configured
- [ ] Services started with `docker-compose up -d`
- [ ] All services showing as "healthy"
- [ ] Frontend accessible at http://localhost
- [ ] Backend API responding at http://localhost:3004
- [ ] No errors in logs
## 💡 Quick Tips

- Use `docker-compose logs -f` to monitor logs in real-time
- Use `docker-compose exec <service> sh` to access service shell
- Keep your Docker images updated with `docker-compose pull`
- Regularly clean up unused containers with `docker system prune`

---

## ✅ Success Checklist

- [ ] Docker and Docker Compose installed
- [ ] Repository cloned
- [ ] `.env` file created with all required variables
- [ ] Services started with `docker-compose up -d`
- [ ] All services showing as "healthy" in `docker-compose ps`
- [ ] Frontend accessible at http://localhost
- [ ] Backend API responding at http://localhost:3004
- [ ] No errors in logs (`docker-compose logs`)

---

**Need Help?** Check the logs first, then refer to the troubleshooting section above.

**Happy Coding! 🎉**
