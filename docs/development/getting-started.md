# Development Getting Started

> Environment setup, dev commands, and project overview for contributors.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | >= 20 | [nodejs.org](https://nodejs.org/) |
| **pnpm** | >= 10 | `corepack enable && corepack prepare pnpm@latest --activate` |
| **Rust toolchain** | stable | [rustup.rs](https://rustup.rs/) |

### Platform-specific dependencies

- **Windows**: Visual Studio Build Tools 2022 (C++ workload)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)

---

## Clone & Install

```bash
git clone https://github.com/X-T-E-R/my-little-todo.git
cd my-little-todo
pnpm install
```

---

## Development Commands

### Daily development

```bash
# Start Rust backend + Vite frontend together (recommended)
pnpm dev:web

# Start everything via Turborepo (all packages)
pnpm dev

# Start admin panel dev server separately
pnpm dev:admin
```

`pnpm dev:web` starts:
- Rust backend on `http://127.0.0.1:3001` (for web/API mode testing)
- Vite dev server on `http://localhost:5173` (proxies `/api` and `/health` to the backend)

> **Note**: For Tauri desktop development, the app uses local SQLite directly (no backend server needed). The dev server is only required when testing web/API mode.

### Code quality

```bash
pnpm lint        # Biome lint check
pnpm format      # Biome auto-format
pnpm typecheck   # TypeScript type check (core + web)
```

### Testing

```bash
pnpm test        # Run frontend tests (via Turborepo)
pnpm test:rust   # Run Rust backend tests
pnpm test:all    # Run both in parallel
```

### Building

```bash
# Tauri desktop installer
pnpm --filter @my-little-todo/web build

# Standalone server binary
cargo build --release -p mlt-server-bin

# Admin panel
pnpm build:admin

# PWA
pnpm build:pwa
```

For full build details, see [building.md](building.md).

### Version management

```bash
pnpm bump              # Show current version
pnpm bump patch        # 0.3.0 → 0.3.1
pnpm bump minor        # 0.3.0 → 0.4.0
pnpm bump minor --tag  # Bump + git commit + tag + push
```

For details, see [versioning.md](versioning.md).

---

## Project Structure Overview

```
my-little-todo/
├── crates/                     # Rust backend
│   ├── server/                 #   Shared library (mlt-server)
│   └── server-bin/             #   Standalone server binary
├── packages/                   # Frontend (pnpm workspace)
│   ├── core/                   #   Pure TS models & utilities
│   ├── web/                    #   React desktop/web/mobile shared app
│   ├── admin/                  #   Admin panel SPA (server only)
│   └── mobile/                 #   Android app (Capacitor)
├── docs/                       # Design & architecture docs
├── config.example.toml         # Server config template
└── docker-compose.yml          # Docker deployment
```

For detailed structure and conventions, see [architecture/02-project-structure.md](../architecture/02-project-structure.md).

---

## Development Workflow

1. Create a branch from `main`
2. Make changes, run `pnpm lint` and `pnpm typecheck`
3. Commit with conventional format: `feat: ...` / `fix: ...` / `refactor: ...`
4. Open a PR — CI runs lint + tests automatically

---

## Useful Tips

- The Vite dev server proxies `/api` to the Rust backend, so you can use relative paths in the browser.
- Tauri desktop mode is detected via `__TAURI_INTERNALS__` in `window`. In browser dev mode, the app runs in pure HTTP/API mode.
- Native clients (Tauri, Android) use local SQLite via `DataStore` interface — no server connection needed.
- Use `isNativeClient()` from `utils/platform.ts` to conditionally show/hide server-only UI.
- The `packages/core` package has no React dependency — it contains only pure TypeScript models and utilities shared across all frontends.
- Hot reload works for frontend changes; Rust backend changes require restarting `pnpm dev:web`.

### Storage Architecture

The app uses a `DataStore` abstraction layer with three implementations:

| Implementation | Platform | Data Source |
|---|---|---|
| `ApiDataStore` | Web browser | Server REST API |
| `TauriSqliteDataStore` | Tauri desktop | Local SQLite (`@tauri-apps/plugin-sql`) |
| `CapacitorSqliteDataStore` | Android | Local SQLite (`@capacitor-community/sqlite`) |

All implementations support soft deletion (`deleted_at` + `version` fields) for sync compatibility.

### Sync Development

Native clients can sync with an API server. When developing/testing sync features:

```bash
# Start the backend server with auth disabled for easy testing
AUTH_MODE=none pnpm dev:web
```

Or with authentication enabled (default `multi` mode):

```bash
pnpm dev:web
# Register a user at http://localhost:5173, then configure sync in Settings → Cloud Sync
```

The `ApiServerSyncTarget` supports two authentication modes:

- **Token mode**: paste a JWT or long-lived API token directly
- **Credentials mode**: the client auto-logs in with username/password and caches the JWT

To generate a long-lived API token for testing:

```bash
# First get a JWT via login
TOKEN=$(curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' | jq -r .token)

# Then generate a long-lived token (0 = never expires)
curl -s -X POST http://127.0.0.1:3001/api/auth/api-token \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"duration": 0}'
```
