######## Build stage ########
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root manifest to leverage npm workspaces if used; otherwise copy per package
COPY package*.json ./

# Copy shared and frontend manifests
COPY shared/package*.json ./shared/
COPY frontend/package*.json ./frontend/

# Install dependencies for shared and build it
RUN cd shared \
 && npm ci \
 && npm run build

# Install dependencies for frontend (needs devDeps for build)
RUN cd frontend \
 && npm ci

# Copy sources
COPY shared ./shared
COPY frontend ./frontend

# Build the frontend (copies FullCalendar CSS via build script)
RUN cd frontend && npm run build

######## Production stage ########
FROM nginx:alpine

# Copy custom nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"] 