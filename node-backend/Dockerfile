# Multi-stage build for Node.js/TypeScript application
FROM node:20-alpine AS builder

WORKDIR /app

# Update Alpine packages to fix security vulnerabilities (CVE-2025-60876)
RUN apk update && apk upgrade --no-cache

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Update Alpine packages to fix security vulnerabilities (CVE-2025-60876)
RUN apk update && apk upgrade --no-cache

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3004

# Add healthcheck (fixes CIS-DI-0006)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3004/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start the server
CMD ["node", "dist/server.js"]
