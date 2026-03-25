# Standalone Server Deployment (Binary)

For environments without Docker. You'll build the server and frontend from source and run the binary directly.

> **Note**: This guide is for **server deployment** only. Desktop (Tauri) and Android users don't need a server — the apps store data locally in SQLite. See the [README](../../README.md) for desktop and mobile installation.

## Prerequisites

1. **Node.js** >= 20
2. **pnpm** >= 10
   ```bash
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
3. **Rust toolchain**
   ```bash
   # Windows
   winget install Rustlang.Rustup
   # macOS/Linux
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
4. **System dependencies**
   - **Windows**: Visual Studio Build Tools 2022 (C++ workload)
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
   - **Linux**: See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)

## Build

```bash
git clone https://github.com/X-T-E-R/my-little-todo.git
cd my-little-todo
pnpm install

# Build the server
cargo build --release -p mlt-server-bin

# Build the frontend
pnpm --filter @my-little-todo/core build
pnpm --filter @my-little-todo/web build:vite
pnpm build:admin
```

## Prepare Static Files

```bash
mkdir -p static/admin
cp -r packages/web/dist/* static/
cp -r packages/admin/dist/* static/admin/
```

## Start the Server

```bash
export STATIC_DIR=./static
export AUTH_MODE=multi
export JWT_SECRET=$(openssl rand -base64 32)
./target/release/mlt-server
```

You can also create a `config.toml` file (see `config.example.toml` in the project root).

## First-Time Setup

1. Visit `http://localhost:3001/admin` to create the first admin account
2. Once done, users can access the web app at `http://localhost:3001`
3. Admin tasks (user management, stats) are managed at the `/admin` page

## Environment Variables

Same as the Docker deployment — see the environment variables table in the [README](../../README.md#docker-deploy--for-servers).

## Reverse Proxy

Point your domain to `localhost:3001` — no special location rules needed. Works with Nginx, Caddy, or any reverse proxy.
