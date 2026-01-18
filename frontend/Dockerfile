# Frontend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build arguments
ARG VITE_API_BASE_URL
ARG VITE_AEO_API_BASE_URL

# Set as environment variables for Vite build
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_AEO_API_BASE_URL=${VITE_AEO_API_BASE_URL}

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

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
