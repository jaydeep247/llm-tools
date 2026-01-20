# Frontend Dockerfile
FROM node:20-alpine AS builder

# Build argument for API URL
# Empty string means use relative URLs that go through nginx proxy
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (using npm ci for reproducible builds)
RUN npm ci

# Copy source and config files needed for frontend build
COPY . .

# Build frontend
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built frontend from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config if needed
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
