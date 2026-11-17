# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./

RUN npm ci

COPY src ./src/

RUN npm run build && npm prune --omit=dev

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# The app runs with plain `node`, so drop npm/npx/corepack from the runtime image:
# smaller attack surface and no vulnerable npm-bundled deps (e.g. tar) in production
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  && apk upgrade --no-cache

USER node

COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma/
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

# 8080 = API + Socket.IO, 9464 = Prometheus metrics (cluster-internal only)
EXPOSE 8080 9464

CMD ["node", "dist/server.js"]
