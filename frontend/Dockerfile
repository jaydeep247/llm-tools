# Frontend Dockerfile
FROM node:20-alpine AS builder

# Build argument for API URL
# Empty string means use relative URLs that go through nginx proxy
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

WORKDIR /app

# Accept build arguments
ARG VITE_API_BASE_URL
ARG VITE_AEO_API_BASE_URL

# Set as environment variables for Vite build
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_AEO_API_BASE_URL=${VITE_AEO_API_BASE_URL}

# Copy package files
COPY package*.json ./

# Install dependencies (using npm ci for reproducible builds)
RUN npm ci

# Copy source and config files needed for frontend build
COPY . .

# Build frontend
RUN npm run build

# Production stage with nginx (use specific version, not latest)
FROM nginx:1.27-alpine

# Copy built frontend from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config if needed
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Configure nginx to run as non-root (fixes CIS-DI-0001)
# nginx:alpine already has nginx user, but we need to ensure proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Switch to non-root user (nginx user already exists in nginx:alpine)
USER nginx

EXPOSE 80

# Add healthcheck (fixes CIS-DI-0006)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
