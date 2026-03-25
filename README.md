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
- **Local-First** — Desktop and mobile apps store data in local SQLite; optionally sync via API server, WebDAV, or S3
- **Multi-Platform** — Tauri desktop (Windows/macOS/Linux), Android app, web PWA — all sharing the same UI
- **Native AI Support** — Built-in AI magic button, native MCP support for agent integration

<!-- TODO: Add screenshots here -->

## Quick Start

### PC Desktop (Tauri) — Easiest

A local-first app that works out of the box — no server required.

1. Download the installer from [Releases](https://github.com/X-T-E-R/my-little-todo/releases) (Windows .msi/.exe, macOS .dmg, Linux .AppImage)
2. Install and launch — the first run will guide you through the initial setup
3. Data is stored in a local SQLite database — no account or server needed
4. Optionally configure a sync method in Settings → Sync to sync across devices:
   - **API Server** — sync with a My Little Todo server (supports username/password or API token auth)
   - **WebDAV** — sync via any WebDAV-compatible server
   - **S3** — sync to S3-compatible object storage (AWS/MinIO/R2)

### Docker Deploy — For Servers

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
```

**First-time setup**: Visit `http://localhost:3001/admin` to create the first admin account. Once done, users can access the web app at `http://localhost:3001`. Admin tasks (user management, stats) are managed at the `/admin` page.

Data is stored in `./data/` on the host — easy to backup and inspect.

#### Update to Latest Version

```bash
docker compose pull && docker compose up -d
```

<details>
<summary>Docker Environment Variables (server mode only)</summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `AUTH_MODE` | `multi` | `none` / `single` / `multi` |
| `DB_TYPE` | `sqlite` | `sqlite` / `postgres` / `mysql` (see [docker-compose.yml](docker-compose.yml) for PG/MySQL examples) |
| `DATABASE_URL` | — | Database connection string (required for PG/MySQL) |
| `JWT_SECRET` | random | Secret key for JWT tokens (**set this in production!**) |
| `DEFAULT_ADMIN_PASSWORD` | — | Initial admin password |
| `DATA_DIR` | `/app/data` | Data storage directory |
| `STATIC_DIR` | `/app/static` | Frontend static files directory |

</details>

<details>
<summary>Sync API & Authentication</summary>

Desktop and mobile clients can sync with the server using the `/api/sync/*` endpoints. Authentication options:

- **Username & Password** — the client auto-logs in via `POST /api/auth/login` and caches the JWT
- **API Token** — generate a long-lived token via `POST /api/auth/api-token` (requires an existing JWT). Available durations: 30 days, 90 days, 1 year, or never-expires

You can also generate API tokens from the web UI: Settings → Account → API Token.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/changes?since={version}` | GET | Pull changes since a version |
| `/api/sync/status` | GET | Get current sync version |
| `/api/sync/push` | POST | Push local changes to server |
| `/api/auth/api-token` | POST | Generate long-lived API token |

All sync endpoints require `Authorization: Bearer <token>` header.

</details>

To set up a reverse proxy (Nginx / Caddy), point your domain to `localhost:3001` — no special location rules needed.

For standalone binary deployment without Docker, see [docs/deployment/binary.md](docs/deployment/binary.md).

### Android App

1. Download the APK from [Releases](https://github.com/X-T-E-R/my-little-todo/releases)
2. Install and launch — data is stored locally in SQLite
3. The app checks for updates automatically on launch

### PWA Web App — For Mobile

1. Open your deployed server URL in a mobile browser (e.g., `https://your-domain.com`)
2. Log in or register
3. Use the browser's "Add to Home Screen" feature to install the app
4. PWA supports offline caching — previously loaded data remains accessible without network

## First-Time Usage

1. **Desktop / Android users**: Launch the app — the onboarding wizard will guide you through role setup and preferences. All data is stored locally.
2. **Server (web) users**: Visit `http://your-host:3001/admin` to create the first admin account, then open `http://your-host:3001` to start using.
3. Open the **Stream** view, type whatever's on your mind, and the system helps you organize it into tasks

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

## Support

If My Little Todo helps you, consider buying the author a bubble tea!

[![Buy me a bubble tea](https://img.shields.io/badge/Buy%20me%20a%20bubble%20tea-afdian-946ce6)](https://afdian.com/a/xter123)

## Development & Contributing

PRs and issues are welcome!

For development setup, build instructions, and contribution guidelines, see:

- [Development Getting Started](docs/development/getting-started.md) — Environment setup, dev commands, project overview
- [Build Guide](docs/development/building.md) — Building desktop, PWA, mobile, and server

Before submitting a PR:

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
- [x] v0.8 — Local-first architecture + native SQLite + sync engine + Android app
- [ ] v0.9 — AI integration: auto-extract tasks from stream, smart recommendations
- [ ] v1.0 — Full desktop + learning engine: behavior tracking, pattern recognition
- [ ] v2.0 — iOS native app

## Design Philosophy

This project is built on a carefully crafted set of design principles. See the [`docs/design-philosophy/`](docs/design-philosophy/) directory for:

- **Design Constitution** — The 10 unbreakable rules that guide every decision
- **User Persona** — Who we're building for and why traditional todo apps fail them
- **Design Debates** — Every controversial design choice, arguments on both sides, and final decisions
- **Product Skeleton** — How the three core interfaces (Stream / Now / Board) work together

Technical architecture documentation is in [`docs/architecture/`](docs/architecture/).

## License

MIT
