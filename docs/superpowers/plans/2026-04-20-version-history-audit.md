# Version History And Audit Log Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add traceable entity history and lightweight audit events without turning storage into a full event-sourced system.

**Architecture:** Keep current tables as the source of latest state, then append history into two shared tables: `entity_revisions` for snapshot-based per-entity history, and `audit_events` for operation context. Revisions are written in the same transaction as the main mutation, while diff stays on-demand instead of becoming a primary storage format.

**Tech Stack:** TypeScript, Tauri/Capacitor SQLite, Rust `sqlx`, Axum HTTP API, existing `version_seq` monotonic sync versioning.

---

## Options

### Option A: Per-entity revision tables

- Pros:
  - Strong typing per table.
  - Straightforward SQL per entity family.
- Cons:
  - Too many tables and migrations.
  - Multiplies provider/store/test work across desktop + server.
  - Easy to drift from the current “shared host” direction.

### Option B: Single `entity_revisions` table only

- Pros:
  - Smallest schema change.
  - Easy to restore or inspect per-entity history.
- Cons:
  - Weak on “what action caused this”.
  - Bulk imports, sync, MCP, plugin writes all look like isolated row changes.

### Option C: Single `entity_revisions` + single `audit_events`

- Pros:
  - Small schema surface: only two new tables.
  - Separates “entity snapshot history” from “operation context”.
  - Fits both desktop SQLite and hosted server without changing current domain model.
- Cons:
  - Slightly more work than revision-only.
  - First version still needs conservative event metadata defaults.

**Recommendation:** Option C.

## Final Scope

### New tables

- `entity_revisions`
  - Append-only.
  - One row per entity mutation.
  - Stores full snapshot JSON after mutation.
- `audit_events`
  - Append-only.
  - One row per recorded mutation action.
  - Stores source/actor/action metadata plus small summary JSON.

### First implementation scope

- Covered entity types:
  - `tasks`
  - `stream_entries`
  - `settings`
  - `blobs`
  - `work_threads` (local SQLite only)
- Covered runtimes:
  - Tauri SQLite
  - Capacitor SQLite
  - Server SQLite provider
  - Server Postgres provider
- Covered reads:
  - Per-entity revision list
  - Global recent audit event list
  - API client wrappers for hosted mode

### Explicitly postponed

- UI history panel
- Restore/revert UI
- Diff persistence
- Fine-grained request correlation plumbing through all server routes

## Data Model

### `entity_revisions`

- `id`
- `event_id`
- `user_id`
- `entity_type`
- `entity_id`
- `entity_version`
- `global_version`
- `op`
- `changed_at`
- `snapshot_json`

Indexes:

- `(user_id, entity_type, entity_id, global_version DESC)`
- `(event_id)`
- `(user_id, global_version DESC)`

### `audit_events`

- `id`
- `user_id`
- `entity_type`
- `entity_id`
- `entity_version`
- `global_version`
- `action`
- `source_kind`
- `actor_type`
- `actor_id`
- `occurred_at`
- `summary_json`

Indexes:

- `(user_id, occurred_at DESC)`
- `(user_id, source_kind, occurred_at DESC)`
- `(user_id, entity_type, entity_id, occurred_at DESC)`

## Write Rules

### Snapshot policy

- Revision rows store the full post-write snapshot.
- Delete operations store a tombstone snapshot with `deleted_at` populated.
- Diff is computed later by comparing adjacent snapshots.

### Event policy

- Every mutation that writes a revision also writes one audit event.
- First version is intentionally 1:1 between revision and event.
- Default metadata when no richer context exists:
  - desktop stores: `source_kind = desktop-ui`, `actor_type = local-user`, `actor_id = local-desktop-user`
  - server providers: `source_kind = server-api`, `actor_type = user`, `actor_id = user_id`

### Transaction policy

- Main row write, event write, and revision write must happen inside the same transaction when the runtime supports it.
- If the write path already bumps `version_seq`, revision/event rows must reuse that resulting version instead of inventing a second version space.

## Query Surface

### DataStore additions

- `listEntityRevisions(entityType, entityId, limit?)`
- `listAuditEvents(limit?, entityType?, entityId?)`

### Server API additions

- `GET /api/history/revisions?entityType=...&entityId=...&limit=...`
- `GET /api/history/events?limit=...&entityType=...&entityId=...`

Response shape stays JSON-native so the web client can build history UI later without another schema pass.

## Phase 2 Gaps Found During Smoke Verification

The first implementation passed write/read smoke tests, but exposed three practical gaps that should be fixed before calling this a product-grade history system:

### Gap 1: Task revision snapshots are still raw task facets

- Current `tasks` revision payloads do not contain the user-facing body content, because body lives in `stream_entries`.
- Fix: hydrate task revision reads by joining the latest matching stream revision at or before the task revision's `global_version`.

### Gap 2: One user action still appears as multiple unrelated history rows

- A task write currently produces one stream revision and one task revision with no stable correlation key.
- Fix: add `group_id` to both history tables and populate it from high-level operations when a single action writes multiple entities.

### Gap 3: Settings history may capture secrets

- Some settings values can contain API keys, bearer tokens, or passwords.
- Fix: add a small sensitive-key detector and store redacted snapshots for matching settings while keeping event metadata.

### Second-round implementation scope

- Add `group_id` to `audit_events` and `entity_revisions`
- Hydrate `tasks` history on read in both local SQLite stores and server providers
- Add redacted settings snapshot policy in both local and server write paths
- Verify with fresh HTTP smoke tests for create/delete/history readback

## Implementation Tasks

### Task 1: Add shared history types and plan constraints

**Files:**
- Modify: `packages/web/src/storage/dataStore.ts`

- [ ] Define shared TypeScript types for revision rows and audit events.
- [ ] Extend `DataStore` with read methods for revisions and audit events.
- [ ] Keep the new surface read-only for now; writes stay internal to each store/provider.

### Task 2: Add SQLite schema and migrations

**Files:**
- Modify: `packages/web/src/storage/sqliteSchema.ts`
- Modify: `packages/web/src/storage/tauriSqliteStore.ts`
- Modify: `packages/web/src/storage/capacitorSqliteStore.ts`

- [ ] Bump local schema version.
- [ ] Add `CREATE TABLE IF NOT EXISTS` + indexes for `entity_revisions` and `audit_events`.
- [ ] Add migration path for older local DBs before index creation runs.

### Task 3: Log local mutations into revision/event tables

**Files:**
- Modify: `packages/web/src/storage/tauriSqliteStore.ts`
- Modify: `packages/web/src/storage/capacitorSqliteStore.ts`

- [ ] Add small helper functions to write audit + revision rows.
- [ ] Hook task / stream / setting / blob / work-thread writes and deletes.
- [ ] Reuse existing `version_seq` result as `global_version`.

### Task 4: Add local read queries

**Files:**
- Modify: `packages/web/src/storage/tauriSqliteStore.ts`
- Modify: `packages/web/src/storage/capacitorSqliteStore.ts`

- [ ] Add per-entity revision list query.
- [ ] Add recent audit event query with optional entity filter.

### Task 5: Extend server provider trait and migrations

**Files:**
- Modify: `crates/server/src/providers/traits.rs`
- Modify: `crates/server/src/providers/sqlite.rs`
- Modify: `crates/server/src/providers/postgres.rs`

- [ ] Add shared Rust structs for revision and audit event rows.
- [ ] Add provider read methods.
- [ ] Add migration steps to both SQLite and Postgres providers.
- [ ] Write audit + revision rows from existing mutation paths.

### Task 6: Add server history routes and API client support

**Files:**
- Create: `crates/server/src/routes/history.rs`
- Modify: `crates/server/src/routes/mod.rs`
- Modify: `crates/server/src/lib.rs`
- Modify: `packages/web/src/storage/apiDataStore.ts`

- [ ] Add protected history endpoints.
- [ ] Wire them into the app router.
- [ ] Add hosted client methods that call the new endpoints.

### Task 7: Verify with targeted tests and compile checks

**Files:**
- Modify/Create as needed under:
  - `packages/web/src/storage/*.test.ts`
  - `crates/server/src/providers/*`
  - `crates/server/src/routes/*`

- [ ] Cover migration + write-path logging for local SQLite.
- [ ] Cover provider history reads on the server side where practical.
- [ ] Run TypeScript compile, targeted vitest, and cargo checks/tests before any completion claim.
