# syntax=docker/dockerfile:1.7
#
# Pantrybook container image.
#   docker build -t pantrybook .
#   docker run -p 3000:3000 -v pantrybook-data:/data pantrybook

ARG NODE_VERSION=22

# ---- dependencies ------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# better-sqlite3 ships prebuilt binaries for linux x64/arm64, so no compiler is needed.
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund

# ---- build -------------------------------------------------------------------
FROM deps AS build
COPY . .
ARG BUILD_NUMBER=0
ARG GIT_SHA=unknown
ARG SOURCE_DATE_EPOCH
ENV BUILD_NUMBER=${BUILD_NUMBER} \
    GIT_SHA=${GIT_SHA} \
    SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH} \
    RELEASE_CHANNEL=docker
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ---- runtime -----------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ARG VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_DATE
LABEL org.opencontainers.image.title="Pantrybook" \
      org.opencontainers.image.description="Free, self-hostable, offline-capable intake and distribution app for food pantries." \
      org.opencontainers.image.source="https://github.com/lobojoel2003/Pantrybook" \
      org.opencontainers.image.url="https://github.com/lobojoel2003/Pantrybook" \
      org.opencontainers.image.documentation="https://github.com/lobojoel2003/Pantrybook#readme" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PANTRYBOOK_DATA_DIR=/data \
    BODY_SIZE_LIMIT=10M

WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# The admin CLI (reset passwords, backups) runs straight from the TypeScript source.
COPY --from=build /app/scripts/cli.ts ./scripts/cli.ts
COPY --from=build /app/src/lib/server ./src/lib/server
COPY --from=build /app/src/lib/shared ./src/lib/shared
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh \
    && rm -f src/lib/server/*.test.ts src/lib/shared/*.test.ts src/lib/server/test-helpers.ts \
    && mkdir -p /data && chown node:node /data

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The entrypoint fixes ownership of the data volume, then runs as the unprivileged `node` user.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "build"]
