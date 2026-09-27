FROM node:24.13.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node src/lib/print ./src/lib/print
COPY --chown=node:node src/lib/ar ./src/lib/ar
COPY --chown=node:node infra/cloudflare/geometry/server.mjs infra/cloudflare/geometry/runner.ts ./infra/cloudflare/geometry/
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "infra/cloudflare/geometry/server.mjs"]
