# syntax=docker/dockerfile:1
# Build context: repository root (bun workspaces need the root lockfile).

FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Full install (build stage only, discarded): Vite reads the tsconfig chain, and
# tsconfig.base.json extends @tsconfig/strictest, a root devDependency.
RUN bun install --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json ./
COPY apps/web apps/web
# `import type` from the API is erased at build time: no API sources needed here.
RUN bun run --cwd apps/web build

# Unprivileged nginx: runs as non-root, listens on 8080.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
