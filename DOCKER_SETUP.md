# Docker Setup Guide

This guide will help you run the entire Contentlytics application using Docker.

## Prerequisites

- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
- **Docker Compose** v2.0 or higher
- At least 8GB of RAM available for Docker
- 10GB of free disk space

## Quick Start (3 Steps)

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd llm-tools
```

### 2. Create Environment File

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit the `.env` file and add your API keys:

```env
# Required API Keys
OPENAI_API_KEY=your_openai_api_key_here
DATAFORSEO_LOGIN=your_dataforseo_login
DATAFORSEO_PASSWORD=your_dataforseo_password

# Database Configuration (already configured for Docker)
DB_HOST=postgres
DB_PORT=5432
DB_NAME=contentlytics
DB_USER=postgres
DB_PASSWORD=your_secure_password_here

# Redis Configuration (already configured for Docker)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here

# JWT Secrets (generate random strings)
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here

# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=your_email@gmail.com

# Application URLs
FRONTEND_URL=http://localhost:3000
API_BASE_URL=http://localhost:3004
AEO_API_BASE_URL=http://localhost:8000
```

**Important Notes:**
- Change all passwords to secure values
- Get OpenAI API key from: https://platform.openai.com/api-keys
- Get DataForSEO credentials from: https://dataforseo.com/
- For Gmail SMTP, use an [App Password](https://support.google.com/accounts/answer/185833)

### 3. Start the Application

```bash
docker-compose up -d
```

That's it! The application will start automatically.

## Accessing the Application

Once all containers are running:

- **Frontend (Web UI)**: http://localhost:3000
- **Backend API**: http://localhost:3004
- **AEO API**: http://localhost:8000
- **Database**: localhost:5432
- **Redis**: localhost:6379

### Default Login Credentials

On first run, register a new account at: http://localhost:3000

## Services Overview

The application consists of 6 Docker containers:

| Service | Description | Port |
|---------|-------------|------|
| `contentlytics-frontend` | React + Nginx web interface | 3000 |
| `contentlytics-backend` | Node.js API server | 3004 |
| `contentlytics-aeo-api` | Python FastAPI for AEO analysis | 8000 |
| `contentlytics-seo-worker` | Background SEO processing | - |
| `contentlytics-db` | PostgreSQL database | 5432 |
| `contentlytics-redis` | Redis cache & queue | 6379 |

## Common Commands

### Start the Application
```bash
docker-compose up -d
```

### Stop the Application
```bash
docker-compose down
```

### View Logs (All Services)
```bash
docker-compose logs -f
```

### View Logs (Specific Service)
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f aeo-api
docker-compose logs -f seo-worker
```

### Rebuild After Code Changes
```bash
docker-compose up -d --build
```

### Rebuild Specific Service
```bash
docker-compose up -d --build backend
docker-compose up -d --build frontend
```

### Restart a Service
```bash
docker-compose restart backend
docker-compose restart frontend
```

### Check Container Status
```bash
docker-compose ps
```

### Stop and Remove Everything (Including Data)
```bash
docker-compose down -v
```
⚠️ **Warning**: The `-v` flag deletes all data including database!

## Health Checks

Check if all services are healthy:

```bash
docker-compose ps
```

All services should show `healthy` or `Up` status.

### Manual Health Checks

```bash
# Backend API
curl http://localhost:3004/health

# AEO API
curl http://localhost:8000/health

# Database
docker exec contentlytics-db pg_isready -U postgres
```

## Troubleshooting

### Port Already in Use

If you get "port already allocated" errors:

```bash
# Check what's using the port
netstat -ano | findstr :3000
netstat -ano | findstr :3004
netstat -ano | findstr :8000

# Kill the process or change ports in docker-compose.yml
```

### Container Won't Start

1. Check logs:
   ```bash
   docker-compose logs <service-name>
   ```

2. Verify `.env` file exists and has correct values

3. Ensure Docker has enough resources (8GB RAM minimum)

### Database Connection Failed

1. Verify database is healthy:
   ```bash
   docker-compose ps contentlytics-db
   ```

2. Check database logs:
   ```bash
   docker-compose logs contentlytics-db
   ```

3. Restart the database:
   ```bash
   docker-compose restart contentlytics-db
   ```

### Redis Connection Failed

1. Check Redis is running:
   ```bash
   docker-compose ps contentlytics-redis
   ```

2. Test Redis connection:
   ```bash
   docker exec contentlytics-redis redis-cli ping
   ```

### Frontend Shows Blank Page

1. Check browser console for errors (F12)

2. Verify backend is running:
   ```bash
   curl http://localhost:3004/health
   ```

3. Clear browser cache and hard refresh (Ctrl+Shift+R)

### AEO Analysis Returns 404

1. Check AEO API logs:
   ```bash
   docker-compose logs aeo-api
   ```

2. Verify OPENAI_API_KEY is set in `.env`

3. Restart AEO API:
   ```bash
   docker-compose restart aeo-api
   ```

### SEO Worker Not Processing Jobs

1. Check worker logs:
   ```bash
   docker-compose logs seo-worker
   ```

2. Verify Redis connection:
   ```bash
   docker exec contentlytics-redis redis-cli ping
   ```

3. Check queue has jobs:
   ```bash
   docker exec contentlytics-redis redis-cli LLEN "bull:seo-analysis:wait"
   ```

## Development Mode

### Hot Reload (Development)

For development with hot reload, you can mount your code as volumes:

```yaml
# Add to docker-compose.yml under backend service
volumes:
  - ./src:/app/src
  - ./config:/app/config
```

Then restart:
```bash
docker-compose up -d --build backend
```

### Running Database Migrations

Migrations are run automatically on container startup. To manually run migrations:

```bash
# Run all migrations (including mobile alternate link feature)
docker exec contentlytics-backend npm run db:crawlMigrate

# Or run directly
docker exec contentlytics-backend node dist/database/scripts/crawlerTableMigration.js
```

**Note**: The latest migration adds support for Mobile Alternate Link detection, which helps identify separate mobile URLs (e.g., m.example.com) for legacy mobile setups.

### Accessing Database CLI

```bash
docker exec -it contentlytics-db psql -U postgres -d contentlytics
```

Common SQL commands:
```sql
-- List all tables
\dt

-- View users
SELECT * FROM users;

-- View crawl sessions
SELECT * FROM crawl_sessions;

-- Exit
\q
```

### Accessing Redis CLI

```bash
docker exec -it contentlytics-redis redis-cli
```

Common Redis commands:
```bash
# List all keys
KEYS *

# Check queue length
LLEN "bull:seo-analysis:wait"

# Clear all data (WARNING!)
FLUSHALL

# Exit
exit
```

## Production Deployment

For production deployment:

1. **Change all default passwords** in `.env`
2. **Set secure JWT secrets** (use random 64-character strings)
3. **Configure proper CORS** in backend (not `*`)
4. **Use SSL certificates** (add nginx SSL config)
5. **Set up backups** for PostgreSQL database
6. **Monitor logs** using logging service
7. **Set resource limits** in docker-compose.yml

### Example Resource Limits

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## Backup and Restore

### Backup Database

```bash
docker exec contentlytics-db pg_dump -U postgres contentlytics > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker exec -i contentlytics-db psql -U postgres contentlytics
```

### Backup Volumes

```bash
docker run --rm \
  -v contentlytics_postgres-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz /data
```

## Performance Optimization

### Adjust Worker Concurrency

Edit `config/seo.json`:
```json
{
  "concurrency": 2,  // Increase for faster processing (max 6)
  "backoffBaseMs": 3000
}
```

### Adjust Batch Size

Edit `config/audits.json`:
```json
{
  "auditBatchSize": 12  // Increase for faster audits
}
```

## Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify all environment variables in `.env`
3. Ensure Docker has enough resources
4. Try rebuilding: `docker-compose up -d --build`

## License

[Your License Here]
