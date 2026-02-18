# Multi-stage Dockerfile for LLM-Auto-Optimizer

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package manifest and install all dependencies (incl. devDeps for tsc)
COPY package.json ./
RUN npm install --ignore-scripts

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim

# Use the built-in non-root 'node' user (UID 1000) from the base image

WORKDIR /app

# Copy package manifest and install production dependencies only
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Set ownership and switch to non-root user
RUN chown -R node:node /app
USER node

# Cloud Run injects PORT; default to 8080
EXPOSE 8080

# Start the server
CMD ["node", "dist/server.js"]
