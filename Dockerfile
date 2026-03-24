# ── Stage 1: Build frontend ──────────────────────────────────────
FROM node:22-bookworm AS frontend-builder

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

COPY packages/core packages/core
COPY packages/web packages/web
COPY biome.json tsconfig.base.json ./

RUN pnpm --filter @my-little-todo/core build && \
    pnpm --filter @my-little-todo/web build:vite

# ── Stage 2: Build Rust server ───────────────────────────────────
FROM rust:1-bookworm AS rust-builder

ARG GIT_HASH=unknown

WORKDIR /app
COPY crates crates
COPY Cargo.lock ./

# Create a server-only workspace (excludes Tauri desktop crate)
RUN printf '[workspace]\nresolver = "2"\nmembers = ["crates/server", "crates/server-bin"]\n' > Cargo.toml

RUN GIT_HASH=${GIT_HASH} cargo build --release -p mlt-server-bin

# ── Stage 3: Runtime ─────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=rust-builder /app/target/release/mlt-server /usr/local/bin/mlt-server
COPY --from=frontend-builder /app/packages/web/dist /app/static

ENV PORT=3001 \
    HOST=0.0.0.0 \
    AUTH_MODE=multi \
    DB_TYPE=sqlite \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/static

RUN mkdir -p /app/data

VOLUME /app/data
EXPOSE 3001

CMD ["mlt-server"]
