# Build from repo root: docker build -f packages/swarm-bus-mcp/Dockerfile -t vibers-swarm-bus .

FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
RUN npm ci
RUN npm run build -w @vibers/swarm-bus-mcp

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/swarm-bus-mcp/package.json ./packages/swarm-bus-mcp/
COPY --from=builder /app/packages/swarm-bus-mcp/dist ./packages/swarm-bus-mcp/dist
EXPOSE 3100
CMD ["node", "packages/swarm-bus-mcp/dist/server.js"]
