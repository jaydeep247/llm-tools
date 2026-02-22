# =============================================================================
# PRODUCTION-GRADE Next.js Dockerfile
# Eliminates: ChunkLoadError, 404 static assets, hash mismatches
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables (baked into the bundle)
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Production Runner
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apk add --no-cache nginx

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create nginx runtime directories
RUN mkdir -p /run/nginx /var/log/nginx /var/lib/nginx/tmp && \
    chown -R nginx:nginx /var/log/nginx /var/lib/nginx /run/nginx

# -----------------------------------------------------------------------------
# CRITICAL: Copy static assets to be served DIRECTLY by nginx
# This ensures nginx serves files from disk, NOT proxied through Node.js
# -----------------------------------------------------------------------------

# Copy public assets (served at /)
COPY --from=builder /app/public /app/public

# Copy Next.js static assets (served at /_next/static)
COPY --from=builder /app/.next/static /app/.next/static

# Copy standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Set ownership
RUN chown -R nextjs:nodejs /app

# Copy nginx configuration
COPY nginx.conf /etc/nginx/http.d/default.conf

# Startup script that runs both nginx and Next.js
RUN printf '#!/bin/sh\n\
nginx\n\
exec node /app/server.js\n' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1

# Run as root to allow nginx to bind to port 80, but Next.js runs as nextjs
CMD ["/bin/sh", "-c", "nginx && su nextjs -s /bin/sh -c 'node /app/server.js'"]
