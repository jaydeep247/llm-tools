# Multi-stage build for Node.js/TypeScript application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript application
RUN npm run build

# Build frontend
RUN npm run build:frontend

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./
COPY --from=builder /app/config ./config

# Expose ports
EXPOSE 3004

# Start the server
CMD ["node", "dist/server.js"]
