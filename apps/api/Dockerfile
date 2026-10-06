# syntax=docker/dockerfile:1
# Build context: repository root (bun workspaces need the root lockfile).

FROM oven/bun:1.4.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Production dependencies of the API only; no lifecycle scripts (git hooks etc.).
RUN bun install --frozen-lockfile --production --ignore-scripts --filter @template/api

FROM oven/bun:1.4.2-alpine
WORKDIR /app
# UTC: better-auth's tables use `timestamp` without time zone (see docs/architecture.md).
ENV NODE_ENV=production TZ=UTC
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/package.json apps/api/
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/src apps/api/src
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Applies pending migrations, then serves (see src/main.ts).
CMD ["bun", "apps/api/src/main.ts"]
