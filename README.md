# My Little Todo

> Not a task manager — your external execution system.

Traditional todo apps are "ledgers" that faithfully record your debts. My Little Todo is a "coach" — it pushes you forward, then watches you run.

[中文文档](README-CN.md)

## Features

- **Stream Input** — Record ideas like chatting; the system organizes for you
- **Role-Driven** — Life is one big RPG — switch roles, switch context
- **DDL-Driven** — Deadlines have 3 hardness levels (hard / commitment / soft); delays require a reason
- **Focus on Now** — Open the app and see only one thing + two buttons ("Start" / "Skip")
- **Learn, Not Punish** — Every rejection, procrastination, and deviation is training data, not a mistake
- **Multi-Device Sync** — Desktop, web, and mobile — data syncs through a unified API
- **Native AI Support** — Built-in AI magic button, native MCP support for agent integration

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Rust Unified Backend                    │
│            crates/server (mlt-server)               │
│  ┌─────────┐  ┌──────────┐  ┌───────────────┐      │
│  │  Axum   │  │ SQLite / │  │ JWT Auth +    │      │
│  │  HTTP   │  │ PG/MySQL │  │ Multi-user    │      │
│  │ Server  │  │ /MongoDB │  │ Support       │      │
│  └─────────┘  └──────────┘  └───────────────┘      │
└───────────────────┬─────────────────────────────────┘
                    │ REST API (/api/*)
       ┌────────────┼────────────┬──────────────┐
       │            │            │              │
  ┌────▼────┐  ┌───▼────┐  ┌───▼────┐  ┌──────▼──────┐
  │  PC     │  │  Web   │  │ Mobile │  │   Admin     │
  │ Tauri 2 │  │ React  │  │  PWA   │  │   Panel     │
  │(embed)  │  │  SPA   │  │        │  │  React SPA  │
  └─────────┘  └────────┘  └────────┘  └─────────────┘
```

## Tech Stack

| Layer     | Technology                                      |
|-----------|--------------------------------------------------|
| Backend   | Rust + Axum                                      |
| Database  | SQLite (default) / PostgreSQL / MySQL / MongoDB  |
| ORM       | sqlx                                             |
| Auth      | JWT + Argon2                                     |
| Desktop   | [Tauri 2](https://v2.tauri.app/)                 |
| Frontend  | React 19 + TypeScript 5                          |
| Build     | Vite 8                                           |
| Styling   | TailwindCSS v4                                   |
| Animation | Framer Motion                                    |
| State     | Zustand                                          |
| Linting   | Biome                                            |
| Monorepo  | pnpm workspaces + Turborepo                      |
| i18n      | i18next + react-i18next                          |

## Quick Start

### Docker Deploy (Recommended)

No need to clone the repo. Create a `docker-compose.yml` on your server:

```yaml
services:
  mlt:
    image: ghcr.io/x-t-e-r/my-little-todo:latest
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - AUTH_MODE=multi
      - JWT_SECRET=change-me-to-a-random-string
    restart: unless-stopped
```

Then run:

```bash
# Generate a secure JWT secret
echo "JWT_SECRET=$(openssl rand -base64 32)" > .env

# Start
docker compose up -d

# Access at http://localhost:3001
```

Data is stored in `./data/` on the host — easy to backup and inspect.

#### Update to Latest Version

```bash
docker compose pull && docker compose up -d
```

#### Docker Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `AUTH_MODE` | `multi` | `none` / `single` / `multi` |
| `DB_TYPE` | `sqlite` | `sqlite` / `postgres` / `mysql` |
| `DATABASE_URL` | — | Database connection string (for PG/MySQL) |
| `JWT_SECRET` | random | Secret key for JWT tokens (**set this in production!**) |
| `DEFAULT_ADMIN_PASSWORD` | — | Initial admin password |
| `DATA_DIR` | `/app/data` | Data storage directory |
| `STATIC_DIR` | `/app/static` | Frontend static files directory |

### Build from Source

```bash
git clone https://github.com/X-T-E-R/my-little-todo.git
cd my-little-todo
```

#### Prerequisites

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

#### Install & Dev

```bash
pnpm install

# Start web dev server (Vite + Rust backend)
pnpm dev:web

# Start Tauri desktop dev mode
pnpm --filter @my-little-todo/web dev

# Start standalone Rust server
cargo run -p mlt-server-bin

# Start admin panel dev
pnpm dev:admin
```

> First run compiles Rust crates (~2-5 minutes). Subsequent incremental builds are fast.

#### Build

```bash
# Desktop installer (MSI/EXE/DMG/AppImage)
pnpm --filter @my-little-todo/web build

# Standalone server binary
cargo build --release -p mlt-server-bin

# Admin panel
pnpm build:admin

# PWA
pnpm build:pwa
```

## Deployment Modes

### Mode 1: PC Desktop (Tauri)

- Download and install — works out of the box
- Embedded Rust backend + SQLite
- Single-user by default; optional password & multi-user in settings
- Optional LAN access for mobile / other devices
- Can also connect to a remote cloud server

### Mode 2: Standalone Server

- Run `mlt-server` binary or use Docker
- Configure via `config.toml` or environment variables
- Multi-user with password auth by default
- Supports SQLite / PostgreSQL / MySQL / MongoDB
- Web and mobile clients connect via browser

## MCP Integration

My Little Todo includes a native [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server, enabling AI agents (Cursor, Claude Desktop, etc.) to interact with your task system directly.

For detailed AI integration guidance, see the [`skills/`](skills/) directory.

### Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "my-little-todo": {
      "url": "http://localhost:3001/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `get_overview` | Dashboard: task counts, urgent DDLs, roles, schedule blocks, today's stream count |
| `list_tasks` | List tasks (filter by status/role, includes role_name, excludes body) |
| `get_task` | Get full task details (body, submissions, postponements) |
| `create_task` | Create a task (title + optional DDL/role/tags/parent) |
| `update_task` | Update task properties or status (complete/cancel/postpone with note) |
| `delete_task` | Delete a task |
| `add_stream` | Add a stream entry (idea/note/progress) |
| `list_stream` | List recent stream entries |
| `search` | Full-text search across tasks and stream (with scope filter) |

## API Reference

| Endpoint | Description |
|----------|-------------|
| `GET/PUT/DELETE /api/files` | File CRUD |
| `POST /api/auth/login` | User login |
| `POST /api/auth/register` | User registration |
| `GET /api/auth/me` | Current user info |
| `GET/PUT/DELETE /api/settings` | User settings CRUD |
| `GET /api/admin/*` | Admin operations |
| `GET /api/export/json` | Export as JSON |
| `GET /api/export/markdown` | Export as Markdown |
| `POST /api/import/json` | Import from JSON |
| `POST /api/mcp` | MCP protocol endpoint |

## Data Storage

All data is stored in a database (SQLite by default).

| Layer | Content | Storage |
|-------|---------|---------|
| L0 | Bootstrap config (port, DB type, auth mode) | TOML file + env vars |
| L1 | User settings (roles, shortcuts, schedule, preferences) | DB `settings` table |
| L2 | Content data (stream entries, tasks, archive) | DB `files` table |

### Export / Import

- Export as JSON / Markdown ZIP / disk directory
- Exports include version metadata (`_meta.json`)
- Import from JSON or Markdown ZIP
- Continuous export mode mirrors data to local directory in real-time
- Cloud backup via S3 / WebDAV (in progress)

## Code Quality

```bash
pnpm lint        # Lint
pnpm format      # Format
pnpm typecheck   # Type check
pnpm test        # Test
```

## Contributing

PRs and issues are welcome! Before submitting, please run:

```bash
pnpm lint        # Lint check
pnpm typecheck   # Type check
```

## Roadmap

- [x] v0.1 — Core skeleton: Now / Stream / Board views
- [x] v0.2 — Role system + rich stream editor
- [x] v0.3 — Rust unified backend + multi-device + auth
- [x] v0.4 — Unified storage architecture + data import/export
- [x] v0.5 — Onboarding + contextual tips
- [x] v0.6 — Cloud backup UI + ZIP export/import + PC cloud mode
- [x] v0.7 — Docker deployment + MCP support + i18n
- [ ] v0.8 — AI integration: auto-extract tasks from stream, smart recommendations
- [ ] v0.9 — Learning engine: behavior tracking, pattern recognition
- [ ] v1.0 — Full desktop: system tray, global shortcuts, cloud backup
- [ ] v2.0 — Native mobile app

## Design Philosophy

This project is built on a carefully crafted set of design principles. See the [`docs/design-philosophy/`](docs/design-philosophy/) directory for:

- **Design Constitution** — The 10 unbreakable rules that guide every decision
- **User Persona** — Who we're building for and why traditional todo apps fail them
- **Design Debates** — Every controversial design choice, arguments on both sides, and final decisions
- **Product Skeleton** — How the three core interfaces (Stream / Now / Board) work together

Technical architecture documentation is in [`docs/architecture/`](docs/architecture/).

## License

MIT
