# local-browser-relay — tiny stateless WebSocket byte-pump (Model B).
# Build context: the relay/ dir. Invoke: docker build -f relay/Dockerfile relay
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache wget
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
ENV NODE_ENV=production
ENV PORT=8090
EXPOSE 8090
# Liveness — the relay exposes /health.
HEALTHCHECK --interval=30s --timeout=4s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/health || exit 1
USER node
CMD ["node", "server.js"]
