# Infra Deployment Guide (RabbitMQ + Redis)

This project is now split into:

- Base stack: app services only (expects external Redis/RabbitMQ)
- Local infra overlay: spins up Redis/RabbitMQ in Docker for local development

## Files

- `docker-compose.yml` -> base stack (production-safe default)
- `docker-compose.local-infra.yml` -> local RabbitMQ/Redis overlay

## 1) Local Development (with Dockerized Redis/RabbitMQ)

```bash
docker compose -f docker-compose.yml -f docker-compose.local-infra.yml up --build -d
```

This starts:

- app services (`nnode-backend`, `npy-backend`, `crawl-worker`, `ref-frontend`)
- local `rabbitmq` and `redis`

## 2) Server / Production (external Redis/RabbitMQ)

Run only the base stack:

```bash
docker compose -f docker-compose.yml up --build -d
```

Required environment variables:

- `RABBITMQ_URL` (managed/external endpoint)
- `REDIS_URL` (managed/external endpoint)
- `JWT_SECRET`, `COOKIE_SECRET`, and other app secrets

Example:

```env
NODE_ENV=production
RABBITMQ_URL=amqps://user:pass@your-broker.example.com/vhost
REDIS_URL=rediss://default:password@your-redis.example.com:6380
ALLOW_LOCAL_INFRA_IN_PROD=false
```

## Production Safety Guard

Both backends now fail fast when:

- `NODE_ENV=production` (or `ENVIRONMENT=production` for Python), and
- `RABBITMQ_URL`/`REDIS_URL` point to localhost or local-compose hostnames, and
- `ALLOW_LOCAL_INFRA_IN_PROD` is not set to `true`

This prevents accidental production deployments tied to local/container infra.

## Recommended Managed Services

- RabbitMQ: CloudAMQP / managed AMQP provider
- Redis: Redis Cloud / managed Redis service

Use TLS endpoints (`amqps://`, `rediss://`) where available.
