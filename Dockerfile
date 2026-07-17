# ─── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install all dependencies (including dev for build tools)
RUN npm ci

# Copy source code
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src/ src/
COPY server/ server/
COPY public/ public/

# Build frontend (Vite → dist/)
RUN npx vite build

# Build server (TypeScript → dist/server/)
RUN npx tsc --project server/tsconfig.json

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built frontend assets
COPY --from=builder /app/dist ./dist

# Copy built server
COPY --from=builder /app/dist/server ./dist/server

# Copy server package assets that might be needed at runtime
COPY server/tsconfig.json ./server/tsconfig.json

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "dist/server/index.js"]
