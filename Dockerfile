# syntax=docker/dockerfile:1
#
# PoolVilla — two build targets, matching the ERP stack's shape:
#
#   --target app  → the Next.js server            (image: <registry>/poolvilla-app)
#   --target web  → nginx with the config baked in (image: <registry>/poolvilla-web)
#
# Build and push from a dev machine; the server only pulls and runs. See
# docs/DEPLOYMENT.md.
#
# Debian slim, not Alpine. sharp and @node-rs/argon2 both ship prebuilt glibc
# binaries; on musl they either fall back to a source build or fail outright,
# which turns a two-minute image build into a toolchain problem.

# ---------------------------------------------------------------------------
# deps — install once, cached on the lockfile alone
# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app

# npm 11 gates package install scripts. The approvals this project needs are
# recorded under "allowScripts" in package.json, so `npm ci` honours them
# without a prompt and without --allow-scripts-pending.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# ---------------------------------------------------------------------------
# builder — produces .next/standalone
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next/font downloads Geist and Noto Sans Thai at build time and inlines them,
# so this stage needs network access. The runtime image does not.
RUN npm run build

# ---------------------------------------------------------------------------
# app — the runtime image
# ---------------------------------------------------------------------------
FROM node:22-slim AS app
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=UTC

# The app formats every date in Asia/Bangkok explicitly through next-intl, so
# the container clock stays UTC. Anything that depends on the ambient timezone
# is a bug; keeping TZ boring makes that bug reproducible instead of local.

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Uploaded villa photos. Mounted as a named volume in compose; the directory
# has to exist and be writable by the app user before that mount lands.
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

# ---------------------------------------------------------------------------
# web — nginx, TLS termination and the reverse proxy
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web

# Baked in, so editing it means rebuilding and pushing this image.
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Certificates are NOT baked in. They are mounted read-only at runtime from
# ./nginx/certs on the server, which is git-ignored.
EXPOSE 80 443
