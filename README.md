# My Little Todo

> Not a task manager — your external execution system.

Traditional todo apps are "ledgers" that faithfully record your debts. My Little Todo is a "coach" — it pushes you forward, then watches you run.

[中文文档](README-CN.md)

## Features

- **Stream Input** — Record ideas like chatting; the system organizes for you
- **Role-Driven** — Life is one big RPG — switch roles, switch context
- **DDL-Driven** — Deadlines have 3 hardness levels (hard / commitment / soft); delays require a reason
- **Focus on Now** — Open the app and see only one thing + two buttons ("Start" / "Skip")
- **Work Thread Runtime** — A resumable context workspace that keeps mission, resume card, working set, waiting conditions, and Now scheduling aligned
- **Learn, Not Punish** — Every rejection, procrastination, and deviation is training data, not a mistake
- **Open-Source Infra Pivot** — Auth now defaults to out-of-box embedded mode, with optional Zitadel enhancement; sync is hosted shared mode through the main project server
- **Multi-Platform** — Tauri desktop (Windows/macOS/Linux), Android app, and web deployment share the same core Todo model
- **Beta Extensions** — AI, S3, server-side backup/restore, window context, desktop widget, think/work thread, and plugins remain outside the stable SLA

## Release Boundary

This repository is still in a pre-release skeleton refactor stage for extensions and host infrastructure. The current direction is:

- keep product-domain modules and the `TS + React` plugin model
- rebuild server plugins around a shared `plugin-runner`
- keep `/api/mcp` and `/api/plugins/:pluginId/*` as host-owned gateways
- freeze auth/sync/MCP scope instead of turning them into separate platforms

See [docs/architecture/03-host-plugin-platform.md](docs/architecture/03-host-plugin-platform.md).

Stable release scope:

- Task CRUD
- Stream entry CRUD and search
- Authentication and multi-user isolation
- Basic attachments
- JSON import and export
- Local SQLite
- OIDC session bootstrap
- Upgrade migrations
- Core settings

Beta / limited scope:

- AI assistant and agent flows
- S3 sync
- Server-side backup and restore
- Window context and desktop widget
- Think session / work thread runtime
- Third-party plugins

Before publishing or upgrading, follow the [release checklist](docs/release/release-checklist.md).

<!-- TODO: Add screenshots here -->

## Quick Start

### PC Desktop (Tauri) — Easiest

A local-first app that works out of the box — no server required.

1. Download the installer from [Releases](https://github.com/X-T-E-R/my-little-todo/releases) (Windows .msi/.exe, macOS .dmg, Linux .AppImage)
2. Install and launch — the first run will guide you through the initial setup
3. Data is stored in a local SQLite database — no account or server needed
4. If you use a shared deployment, point multiple clients to the same My Little Todo server. The default server is out-of-box usable with embedded auth + hosted shared data.

Before upgrading the desktop app, create a full JSON export from `Settings -> Data`.

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
      - AUTH_PROVIDER=embedded
      - EMBEDDED_SIGNUP_POLICY=invite_only
      - SYNC_MODE=hosted
    restart: unless-stopped
```

Then run:

```bash
# Start
docker compose up -d
```

**First-time setup**: open `http://localhost:3001`, create the first owner/admin account, then invite or create more users from `/admin`. This default path does not require ZITADEL, Electric, or Postgres.

Data is stored in `./data/` on the host — easy to backup and inspect.

For release recovery expectations, backup guidance, and stable/Beta boundaries, see [docs/release/release-checklist.md](docs/release/release-checklist.md).

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
| `AUTH_PROVIDER` | `embedded` | `embedded` / `zitadel` |
| `EMBEDDED_SIGNUP_POLICY` | `invite_only` | `invite_only` / `open` / `admin_only` |
| `SYNC_MODE` | `hosted` | Hosted shared mode only |
| `DB_TYPE` | `sqlite` | `sqlite` / `postgres` |
| `DATABASE_URL` | — | Database connection string |
| `ZITADEL_ISSUER` | — | OIDC issuer URL |
| `ZITADEL_CLIENT_ID` | — | OIDC client id |
| `ZITADEL_AUDIENCE` | — | Optional API audience |
| `ZITADEL_ADMIN_ROLE` | — | Optional claim/role mapped to app admin |
| `DATA_DIR` | `/app/data` | Data storage directory |
| `STATIC_DIR` | `/app/static` | Frontend static files directory |

</details>

<details>
<summary>Session Bootstrap</summary>

Clients now bootstrap auth/sync from:

- `GET /api/session/bootstrap`
- `POST /api/session/setup`
- `POST /api/session/login`
- `POST /api/session/logout`
- `GET /api/session/me`

Legacy `/api/auth/*` and `/api/sync/*` routes are no longer part of the runtime main path.

</details>

Migration notes: [docs/deployment/auth-sync-migration.md](docs/deployment/auth-sync-migration.md)

To set up a reverse proxy (Nginx / Caddy), point your domain to `localhost:3001` — no special location rules needed.

For standalone binary deployment without Docker, see [docs/deployment/binary.md](docs/deployment/binary.md).

### Android App

1. Download the APK from [Releases](https://github.com/X-T-E-R/my-little-todo/releases)
2. Install and launch — data is stored locally in SQLite
3. The app checks for updates automatically on launch

### PWA Web App — For Mobile

1. Open your deployed server URL in a mobile browser (e.g., `https://your-domain.com`)
2. On the first install, create the owner account or sign in with an invited account
3. Use the browser's "Add to Home Screen" feature to install the app
4. PWA supports offline caching — previously loaded data remains accessible without network

## First-Time Usage

1. **Desktop / Android users**: Launch the app — the onboarding wizard will guide you through role setup and preferences. All data is stored locally.
2. **Server (web) users**: Visit `http://your-host:3001/admin` to create the first admin account, then open `http://your-host:3001` to start using.
3. Open the **Stream** view, type whatever's on your mind, and the system helps you organize it into tasks
4. Before upgrades, migrations, or sync target changes, create a JSON backup from `Settings -> Data`.

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
| `list_tasks` | List normalized task views filtered by status, `primary_role`, or `role_ids`; body is omitted from list output |
| `get_task` | Get one normalized task view, including canonical body plus parent/subtask summaries |
| `create_task` | Create a canonical task: a stream entry primary record plus a same-id task facet |
| `update_task` | Update task fields; `body` writes through to `stream_entries.content`, `role_ids` is the authority |
| `delete_task` | Delete the canonical task, including the underlying stream entry |
| `add_stream` | Add a stream entry primary record using `role_id` as the stream's primary role |
| `list_stream` | List normalized stream entry views; task-backed entries expose `task_id` |
| `search` | Full-text search across tasks and stream (with scope filter) |

### Task / Stream Model

- `stream_entries` is the single primary record for content, timestamps, attachments, tags, entry type, and primary role.
- `tasks` is only a task facet layered on top of a stream entry.
- `Task.id === StreamEntry.id`.
- `task.body` always comes from `stream_entries.content`.
- `tasks.role_ids` is the authoritative task role set.
- `primary_role` is computed as `role_ids[0] ?? stream_entries.role_id ?? null`.
- Deleting a task deletes the underlying stream entry too.

### Public Schema

Task fields exposed by REST and MCP:

```json
{
  "id": "se-...",
  "title": "string",
  "title_customized": 0,
  "description": null,
  "status": "inbox",
  "body": "string",
  "created_at": 1776000000000,
  "updated_at": 1776000001000,
  "completed_at": null,
  "ddl": null,
  "ddl_type": null,
  "planned_at": null,
  "role_ids": ["role-a", "role-b"],
  "primary_role": "role-a",
  "tags": ["mlt"],
  "parent_id": null,
  "subtask_ids": [],
  "task_type": "task"
}
```

Stream entry fields exposed by REST and MCP:

```json
{
  "id": "se-...",
  "content": "string",
  "entry_type": "spark",
  "timestamp": 1776000000000,
  "date_key": "2026-04-13",
  "role_id": "role-a",
  "tags": ["mlt"],
  "attachments": [],
  "task_id": "se-..."
}
```

Removed public fields:

- Task: `role`, `role_id`, `source_stream_id`
- Stream: `extracted_task_id`

### REST Notes

- `GET /api/tasks` and `GET /api/tasks/:id` now return normalized task objects instead of raw provider rows.
- `PUT /api/tasks/:id` accepts the normalized task schema. Legacy fields are rejected.
- `GET /api/stream*` returns normalized stream entry views.
- `PUT /api/stream/:id` accepts `role_id` for the stream primary role and never exposes `extracted_task_id`.

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
