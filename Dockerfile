# Build stage: compile the web UI with Bun.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json ./
COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install
COPY web ./web
RUN cd web && bun run build

# Runtime stage: run the manager only. Point it at an opencode server with
# OPENCODE_URL and mount the opencode database read-only.
FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4097 \
    AIMAN_HOME=/data
COPY package.json ./
COPY server ./server
COPY bin ./bin
COPY --from=build /app/dist ./dist
VOLUME ["/data"]
EXPOSE 4097
ENTRYPOINT ["bun", "run", "server/src/index.ts"]
