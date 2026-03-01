# Build from repo root: docker build -f packages/orchestrator/Dockerfile -t vibers-orchestrator .

FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY agent-templates ./agent-templates
COPY skill-templates ./skill-templates
RUN npm ci
RUN npm run build -w @vibers/orchestrator

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/orchestrator/package.json ./packages/orchestrator/
COPY --from=builder /app/packages/orchestrator/dist ./packages/orchestrator/dist
COPY --from=builder /app/agent-templates ./agent-templates
COPY --from=builder /app/skill-templates ./skill-templates
EXPOSE 3000
CMD ["node", "packages/orchestrator/dist/server.js"]
