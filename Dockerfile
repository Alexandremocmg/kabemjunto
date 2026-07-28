# syntax=docker/dockerfile:1
# Kabemjunto — imagem única: Fastify + Socket.IO servindo o frontend estático
# no mesmo origin. Volume persistente esperado em /data (ROOM_STORAGE_FILE).

FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S kabemjunto && adduser -S kabemjunto -G kabemjunto

COPY --from=build --chown=kabemjunto:kabemjunto /app/node_modules ./node_modules
COPY --from=build --chown=kabemjunto:kabemjunto /app/package.json ./package.json
COPY --from=build --chown=kabemjunto:kabemjunto /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=kabemjunto:kabemjunto /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=kabemjunto:kabemjunto /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=kabemjunto:kabemjunto /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=kabemjunto:kabemjunto /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /data && chown kabemjunto:kabemjunto /data
VOLUME ["/data"]

USER kabemjunto
EXPOSE 3001
ENV PORT=3001 \
    HOST=0.0.0.0 \
    ROOM_STORAGE_FILE=/data/rooms.json

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3001/live || exit 1

CMD ["node", "apps/server/dist/server.js"]
