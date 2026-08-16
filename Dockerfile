# Install exactly the locked dependency graph in an isolated layer.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

# Next.js needs development dependencies while producing standalone output.
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# The runtime contains only the standalone server and public/static assets.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
LABEL org.opencontainers.image.title="Grapple Drive" \
      org.opencontainers.image.description="A modern Seafile web interface" \
      org.opencontainers.image.source="https://github.com/kayak503/Seafile-Facelift"
RUN addgroup --system --gid 1001 cover && adduser --system --uid 1001 --ingroup cover cover
COPY --from=builder --chown=cover:cover /app/public ./public
COPY --from=builder --chown=cover:cover /app/.next/standalone ./
COPY --from=builder --chown=cover:cover /app/.next/static ./.next/static
USER cover
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=6s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
