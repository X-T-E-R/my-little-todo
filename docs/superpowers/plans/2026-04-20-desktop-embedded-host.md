# Desktop Embedded Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully-disableable desktop embedded host module for Tauri, backed by a sidecar that reuses `mlt-server`, while converging desktop core data onto the shared multi-user schema.

**Architecture:** Keep the desktop UI on direct local SQLite access, but add a new built-in `embedded-host` module that owns a sidecar process exposing `/api/*`, `/api/mcp`, and plugin gateway routes. Unify the desktop core database contract with the server's multi-user schema so both the local store and the sidecar operate on the same core tables and file.

**Tech Stack:** Tauri 2, Rust (`mlt-server`, sidecar binary, Tauri commands), React + Zustand, SQLite, Vitest, cargo test.

## Progress Snapshot (2026-04-20)

### Already Landed

- Built-in `embedded-host` module registration, settings entry, and runtime-gated MCP / plugin server consumers are in place.
- Tauri sidecar lifecycle commands (`status/start/stop/restart`) are wired and the packaged desktop build can auto-start the embedded host.
- Desktop core SQLite has been moved toward the shared multi-user schema with a stable pseudo-user for local mode.
- The settings page now shows current endpoint vs saved endpoint, detects config drift while running, and prompts for embedded-host restart when saved changes are not yet applied.
- Desktop settings are now honest about current capability: loopback only, no auth only, no fake LAN / embedded-auth toggles exposed as if they were working.
- Tauri desktop now also bundles and launches `mlt-plugin-runner`; desktop server plugins can register against the embedded host instead of staying permanently unavailable.

### Remaining High-Priority Work

1. Manual Tauri click-through validation:
   - Enable / disable `embedded-host`
   - Change host / port in settings
   - Verify restart prompt and runtime status transitions in the desktop UI
   - Confirm MCP settings reflect live desktop host state after each transition
2. Optional future capabilities after the base path is stable:
   - LAN exposure
   - Embedded auth / signup policy
   - If those become real runtime capabilities, add restart-app or restart-host prompts only where they are actually required
3. Server-host parity:
   - Reuse the same bundled `mlt-plugin-runner` lifecycle model on the server host
   - Keep desktop and server extension registry behavior aligned
4. Docs closeout:
   - README / README-CN / plugin docs / desktop build docs
   - Explicitly document that the desktop embedded host can be fully disabled
   - Explain that server plugins on desktop depend on both embedded host and bundled plugin runner

---

### Task 1: Define The Embedded Host Module And Shared Runtime Contract

**Files:**
- Create: `packages/web/src/features/embedded-host/embeddedHostContract.ts`
- Create: `packages/web/src/features/embedded-host/embeddedHostContract.test.ts`
- Modify: `packages/web/src/modules/registry.ts`
- Modify: `packages/web/src/settings/registerBuiltinSettings.tsx`
- Modify: `packages/web/src/locales/en/settings.json`
- Modify: `packages/web/src/locales/zh-CN/settings.json`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMBEDDED_HOST_CONFIG,
  embeddedHostBaseUrl,
  normalizeEmbeddedHostConfig,
  validateEmbeddedHostConfig,
} from './embeddedHostContract';

describe('embeddedHostContract', () => {
  it('normalizes loopback config with none auth by default', () => {
    const config = normalizeEmbeddedHostConfig({});
    expect(config).toEqual(DEFAULT_EMBEDDED_HOST_CONFIG);
    expect(embeddedHostBaseUrl(config)).toBe('http://127.0.0.1:23981');
  });

  it('rejects none auth for LAN mode', () => {
    expect(() =>
      validateEmbeddedHostConfig({
        enabled: true,
        host: '0.0.0.0',
        port: 23981,
        authProvider: 'none',
        signupPolicy: 'invite_only',
      }),
    ).toThrow(/LAN mode requires embedded auth/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/web/src/features/embedded-host/embeddedHostContract.test.ts`

Expected: FAIL with module not found for `embeddedHostContract`.

- [ ] **Step 3: Implement the shared contract**

```ts
export type EmbeddedHostAuthProvider = 'none' | 'embedded';
export type EmbeddedHostSignupPolicy = 'admin_only' | 'open' | 'invite_only';

export interface EmbeddedHostConfig {
  enabled: boolean;
  host: string;
  port: number;
  authProvider: EmbeddedHostAuthProvider;
  signupPolicy: EmbeddedHostSignupPolicy;
}

export const DEFAULT_EMBEDDED_HOST_CONFIG: EmbeddedHostConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 23981,
  authProvider: 'none',
  signupPolicy: 'invite_only',
};

export function normalizeEmbeddedHostConfig(
  input: Partial<EmbeddedHostConfig>,
): EmbeddedHostConfig {
  return {
    enabled: input.enabled ?? DEFAULT_EMBEDDED_HOST_CONFIG.enabled,
    host: input.host?.trim() || DEFAULT_EMBEDDED_HOST_CONFIG.host,
    port:
      typeof input.port === 'number' && Number.isInteger(input.port) && input.port > 0
        ? input.port
        : DEFAULT_EMBEDDED_HOST_CONFIG.port,
    authProvider:
      input.authProvider === 'embedded' ? 'embedded' : DEFAULT_EMBEDDED_HOST_CONFIG.authProvider,
    signupPolicy:
      input.signupPolicy === 'admin_only' || input.signupPolicy === 'open'
        ? input.signupPolicy
        : DEFAULT_EMBEDDED_HOST_CONFIG.signupPolicy,
  };
}

export function validateEmbeddedHostConfig(config: EmbeddedHostConfig): void {
  const loopbackOnly = config.host === '127.0.0.1' || config.host === 'localhost';
  if (!loopbackOnly && config.authProvider === 'none') {
    throw new Error('LAN mode requires embedded auth.');
  }
}

export function embeddedHostBaseUrl(config: EmbeddedHostConfig): string {
  return `http://${config.host}:${config.port}`;
}
```

- [ ] **Step 4: Register the built-in module and settings tab entry**

```ts
{
  id: 'embedded-host',
  nameKey: 'module_embedded_host_name',
  descriptionKey: 'module_embedded_host_desc',
  defaultEnabled: false,
  stability: 'beta',
  hasSettingsPage: true,
  category: 'integrations',
  categoryOrder: 0,
}
```

And insert:

```ts
import { EmbeddedHostSettings } from '../features/embedded-host/EmbeddedHostSettings';

{ id: 'embedded-host', component: EmbeddedHostSettings }
```

- [ ] **Step 5: Add translation strings**

```json
"module_embedded_host_name": "Embedded host",
"module_embedded_host_desc": "Optional desktop API/MCP host for local apps and LAN clients.",
"Embedded Host": "Embedded Host",
"Enable embedded host": "Enable embedded host",
"Host address": "Host address",
"Port": "Port",
"Embedded host auth": "Embedded host auth",
"Loopback only": "Loopback only",
"LAN mode requires embedded auth.": "LAN mode requires embedded auth."
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/web/src/features/embedded-host/embeddedHostContract.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/features/embedded-host packages/web/src/modules/registry.ts packages/web/src/settings/registerBuiltinSettings.tsx packages/web/src/locales/en/settings.json packages/web/src/locales/zh-CN/settings.json
git commit -m "feat: add embedded host module contract"
```

### Task 2: Replace Hardcoded Desktop Host Assumptions With Real Runtime State

**Files:**
- Create: `packages/web/src/features/embedded-host/embeddedHostStore.ts`
- Create: `packages/web/src/features/embedded-host/embeddedHostRuntime.test.ts`
- Modify: `packages/web/src/features/mcp-integration/McpIntegrationSettings.tsx`
- Modify: `packages/web/src/plugins/pluginServerRuntime.ts`
- Modify: `packages/web/src/plugins/pluginServerRuntime.test.ts`

- [ ] **Step 1: Write failing runtime tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { resolveDesktopHostBaseUrl } from './embeddedHostStore';

describe('embeddedHostRuntime', () => {
  it('returns null when the embedded host module is disabled', () => {
    expect(
      resolveDesktopHostBaseUrl({
        moduleEnabled: false,
        status: 'inactive',
        config: { enabled: false, host: '127.0.0.1', port: 23981, authProvider: 'none', signupPolicy: 'invite_only' },
      }),
    ).toBeNull();
  });

  it('returns the configured base url when the host is running', () => {
    expect(
      resolveDesktopHostBaseUrl({
        moduleEnabled: true,
        status: 'running',
        config: { enabled: true, host: '127.0.0.1', port: 23981, authProvider: 'none', signupPolicy: 'invite_only' },
      }),
    ).toBe('http://127.0.0.1:23981');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/web/src/features/embedded-host/embeddedHostRuntime.test.ts`

Expected: FAIL because `embeddedHostStore.ts` does not exist.

- [ ] **Step 3: Implement runtime state store**

```ts
import { create } from 'zustand';
import { embeddedHostBaseUrl, type EmbeddedHostConfig } from './embeddedHostContract';

export type EmbeddedHostStatus = 'inactive' | 'starting' | 'running' | 'stopping' | 'failed';

export interface EmbeddedHostRuntimeState {
  moduleEnabled: boolean;
  status: EmbeddedHostStatus;
  config: EmbeddedHostConfig;
  lastError?: string;
}

export function resolveDesktopHostBaseUrl(state: EmbeddedHostRuntimeState): string | null {
  if (!state.moduleEnabled) return null;
  if (state.status !== 'running') return null;
  return embeddedHostBaseUrl(state.config);
}

export const useEmbeddedHostStore = create<EmbeddedHostRuntimeState>(() => ({
  moduleEnabled: false,
  status: 'inactive',
  config: {
    enabled: false,
    host: '127.0.0.1',
    port: 23981,
    authProvider: 'none',
    signupPolicy: 'invite_only',
  },
}));
```

- [ ] **Step 4: Update MCP settings to gate desktop URL on host runtime**

Replace the desktop branch with:

```ts
const hostBaseUrl = resolveDesktopHostBaseUrl(useEmbeddedHostStore.getState());
if (isTauriEnv()) return hostBaseUrl ?? '';
```

And render a disabled / unavailable hint instead of always emitting `127.0.0.1:23981`.

- [ ] **Step 5: Update plugin runtime to refuse desktop registration when host is not running**

Replace:

```ts
if (isTauriEnv()) return TAURI_EMBEDDED_SERVER_BASE;
```

With:

```ts
if (isTauriEnv()) {
  const runtime = useEmbeddedHostStore.getState();
  const baseUrl = resolveDesktopHostBaseUrl(runtime);
  if (!baseUrl) {
    throw new Error('Embedded host is not running.');
  }
  return baseUrl;
}
```

- [ ] **Step 6: Update plugin runtime tests**

Add:

```ts
vi.mock('../features/embedded-host/embeddedHostStore', () => ({
  useEmbeddedHostStore: { getState: () => ({
    moduleEnabled: true,
    status: 'running',
    config: { enabled: true, host: '127.0.0.1', port: 23981, authProvider: 'none', signupPolicy: 'invite_only' },
  }) },
  resolveDesktopHostBaseUrl: () => 'http://127.0.0.1:23981',
}));
```

And a negative test expecting `'Embedded host is not running.'`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run packages/web/src/features/embedded-host/embeddedHostRuntime.test.ts packages/web/src/plugins/pluginServerRuntime.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/features/embedded-host packages/web/src/features/mcp-integration/McpIntegrationSettings.tsx packages/web/src/plugins/pluginServerRuntime.ts packages/web/src/plugins/pluginServerRuntime.test.ts
git commit -m "feat: gate desktop host consumers on runtime state"
```

### Task 3: Add A Desktop Host Sidecar Binary That Reuses `mlt-server`

**Files:**
- Create: `crates/desktop-host-bin/Cargo.toml`
- Create: `crates/desktop-host-bin/src/main.rs`
- Modify: `Cargo.toml`
- Test: `cargo test -p mlt-server`

- [ ] **Step 1: Write the failing integration expectation in plan comments**

Create the crate entry in the workspace first, then verify Cargo resolves it:

```toml
[workspace]
members = [
  "packages/web/src-tauri",
  "crates/server",
  "crates/server-bin",
  "crates/desktop-host-bin"
]
```

- [ ] **Step 2: Run Cargo metadata to verify it fails before the crate exists**

Run: `cargo metadata --no-deps`

Expected: FAIL mentioning missing workspace member `crates/desktop-host-bin`.

- [ ] **Step 3: Add the thin desktop host binary**

`crates/desktop-host-bin/Cargo.toml`

```toml
[package]
name = "mlt-desktop-host"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "mlt-desktop-host"
path = "src/main.rs"

[dependencies]
anyhow = "1"
mlt-server = { path = "../server" }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
```

`crates/desktop-host-bin/src/main.rs`

```rust
use anyhow::Context;
use mlt_server::config::{AuthProvider, EmbeddedSignupPolicy, ServerConfig, SyncMode};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const GIT_HASH: &str = env!("GIT_HASH");

fn env_bool(name: &str, default: bool) -> bool {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<bool>().ok())
        .unwrap_or(default)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let enabled = env_bool("MLT_EMBEDDED_HOST_ENABLED", true);
    if !enabled {
        return Ok(());
    }

    let port = std::env::var("MLT_EMBEDDED_HOST_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(23981);
    let host = std::env::var("MLT_EMBEDDED_HOST_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let data_dir = std::env::var("MLT_DATA_DIR").context("MLT_DATA_DIR is required")?;
    let database_url = std::env::var("MLT_DATABASE_URL").ok();
    let auth_provider = match std::env::var("MLT_EMBEDDED_HOST_AUTH").as_deref() {
        Ok("embedded") => AuthProvider::Embedded,
        _ => AuthProvider::None,
    };
    let embedded_signup_policy = match std::env::var("MLT_EMBEDDED_HOST_SIGNUP_POLICY").as_deref() {
        Ok("admin_only") => EmbeddedSignupPolicy::AdminOnly,
        Ok("open") => EmbeddedSignupPolicy::Open,
        _ => EmbeddedSignupPolicy::InviteOnly,
    };

    let config = ServerConfig {
        port,
        host,
        auth_provider,
        embedded_signup_policy,
        sync_mode: SyncMode::Hosted,
        db_type: mlt_server::config::DbType::Sqlite,
        data_dir,
        database_url,
        zitadel_issuer: String::new(),
        zitadel_client_id: String::new(),
        zitadel_audience: None,
        zitadel_admin_role: None,
        static_dir: None,
        cors_allowed_origins: Vec::new(),
        admin_export_dirs: Vec::new(),
    };

    mlt_server::start(config, VERSION, GIT_HASH).await
}
```

- [ ] **Step 4: Run Cargo metadata to verify it passes**

Run: `cargo metadata --no-deps`

Expected: PASS

- [ ] **Step 5: Run the Rust test suite most likely to catch reuse regressions**

Run: `cargo test -p mlt-server`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml crates/desktop-host-bin
git commit -m "feat: add desktop host sidecar binary"
```

### Task 4: Add A Tauri Sidecar Manager And Runtime Commands

**Files:**
- Create: `packages/web/src-tauri/src/embedded_host.rs`
- Modify: `packages/web/src-tauri/src/lib.rs`
- Modify: `packages/web/src-tauri/Cargo.toml`
- Test: `packages/web/src-tauri/src/embedded_host.rs`

- [ ] **Step 1: Write the failing Rust unit test**

```rust
#[test]
fn loopback_none_auth_is_valid() {
    let config = EmbeddedHostRuntimeConfig::default();
    assert_eq!(config.host, "127.0.0.1");
    assert_eq!(config.port, 23981);
}

#[test]
fn lan_requires_embedded_auth() {
    let config = EmbeddedHostRuntimeConfig {
        enabled: true,
        host: "0.0.0.0".into(),
        port: 23981,
        auth_provider: "none".into(),
        signup_policy: "invite_only".into(),
    };
    assert!(config.validate().is_err());
}
```

- [ ] **Step 2: Run Rust test to verify it fails**

Run: `cargo test -p my-little-todo embedded_host`

Expected: FAIL because `embedded_host.rs` is missing.

- [ ] **Step 3: Implement sidecar manager skeleton**

```rust
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedHostRuntimeConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub auth_provider: String,
    pub signup_policy: String,
}

impl Default for EmbeddedHostRuntimeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            host: "127.0.0.1".into(),
            port: 23981,
            auth_provider: "none".into(),
            signup_policy: "invite_only".into(),
        }
    }
}

impl EmbeddedHostRuntimeConfig {
    pub fn validate(&self) -> Result<(), String> {
        let loopback_only = self.host == "127.0.0.1" || self.host == "localhost";
        if !loopback_only && self.auth_provider == "none" {
            return Err("LAN mode requires embedded auth.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedHostRuntimeState {
    pub status: String,
    pub base_url: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Default)]
pub struct EmbeddedHostManager {
    pub state: Mutex<EmbeddedHostRuntimeState>,
}

#[tauri::command]
pub fn embedded_host_status(app: AppHandle) -> Result<EmbeddedHostRuntimeState, String> {
    let manager = app.state::<Arc<EmbeddedHostManager>>();
    Ok(manager.state.lock().map_err(|e| e.to_string())?.clone())
}
```

- [ ] **Step 4: Register Tauri state and commands**

In `lib.rs` add:

```rust
mod embedded_host;

.manage(std::sync::Arc::new(embedded_host::EmbeddedHostManager::default()))
.invoke_handler(tauri::generate_handler![
    embedded_host::embedded_host_status,
    // start/stop/restart commands added in later task
])
```

- [ ] **Step 5: Run the Rust test to verify it passes**

Run: `cargo test -p my-little-todo embedded_host`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/src-tauri/src/embedded_host.rs packages/web/src-tauri/src/lib.rs packages/web/src-tauri/Cargo.toml
git commit -m "feat: add tauri embedded host manager skeleton"
```

### Task 5: Build The Embedded Host Settings UI And Bridge It To Tauri Runtime Commands

**Files:**
- Create: `packages/web/src/features/embedded-host/EmbeddedHostSettings.tsx`
- Modify: `packages/web/src/features/embedded-host/embeddedHostStore.ts`
- Modify: `packages/web/src/settings/registerBuiltinSettings.tsx`
- Test: `packages/web/src/features/embedded-host/EmbeddedHostSettings.test.tsx`

- [ ] **Step 1: Write the failing UI test**

```tsx
import { render, screen } from '@testing-library/react';
import { EmbeddedHostSettings } from './EmbeddedHostSettings';

describe('EmbeddedHostSettings', () => {
  it('renders host controls and runtime status', () => {
    render(<EmbeddedHostSettings />);
    expect(screen.getByText('Embedded Host')).toBeInTheDocument();
    expect(screen.getByLabelText('Host address')).toBeInTheDocument();
    expect(screen.getByLabelText('Port')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/web/src/features/embedded-host/EmbeddedHostSettings.test.tsx`

Expected: FAIL because the component file does not exist.

- [ ] **Step 3: Implement the settings page**

```tsx
export function EmbeddedHostSettings() {
  const runtime = useEmbeddedHostStore();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-[var(--color-text-secondary)]">Embedded Host</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Optional local desktop API / MCP host. When disabled, no local port is exposed.
        </p>
      </div>
      <label>
        <span>Host address</span>
        <input value={runtime.config.host} readOnly />
      </label>
      <label>
        <span>Port</span>
        <input value={runtime.config.port} readOnly />
      </label>
      <div data-testid="embedded-host-status">{runtime.status}</div>
    </div>
  );
}
```

- [ ] **Step 4: Teach the store to load/save config and refresh runtime state**

```ts
async function refreshRuntime() {
  if (!isTauriEnv()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  const state = await invoke<EmbeddedHostRuntimeState>('embedded_host_status');
  set({ status: state.status, lastError: state.lastError });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/web/src/features/embedded-host/EmbeddedHostSettings.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/features/embedded-host packages/web/src/settings/registerBuiltinSettings.tsx
git commit -m "feat: add embedded host settings UI"
```

### Task 6: Unify The Desktop Core Database File And Migrate Old `data.db`

**Files:**
- Modify: `packages/web/src/storage/tauriSqliteStore.ts`
- Modify: `packages/web/src/storage/migrateLegacy.ts`
- Create: `packages/web/src/storage/unifiedDesktopDb.ts`
- Create: `packages/web/src/storage/unifiedDesktopDb.test.ts`

- [ ] **Step 1: Write the failing migration helper test**

```ts
import { describe, expect, it } from 'vitest';
import { desktopCoreDbFilename } from './unifiedDesktopDb';

describe('unifiedDesktopDb', () => {
  it('uses the shared desktop db filename', () => {
    expect(desktopCoreDbFilename()).toBe('my-little-todo.db');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/web/src/storage/unifiedDesktopDb.test.ts`

Expected: FAIL because `unifiedDesktopDb.ts` is missing.

- [ ] **Step 3: Implement the unified DB helper**

```ts
export function desktopCoreDbFilename(): string {
  return 'my-little-todo.db';
}

export function desktopCoreDbUrl(): string {
  return `sqlite:${desktopCoreDbFilename()}`;
}
```

- [ ] **Step 4: Switch Tauri DB loading to the unified file**

Replace:

```ts
_db = await Database.load('sqlite:data.db');
```

With:

```ts
_db = await Database.load(desktopCoreDbUrl());
```

- [ ] **Step 5: Migrate old desktop DB if needed**

Add to `migrateLegacy.ts`:

```ts
let oldDb: Awaited<ReturnType<typeof Database.load>>;
try {
  oldDb = await Database.load('sqlite:data.db');
} catch {
  oldDb = await Database.load('sqlite:my-little-todo.db');
}
```

And preserve the old file as backup after successful migration.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/web/src/storage/unifiedDesktopDb.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/storage/tauriSqliteStore.ts packages/web/src/storage/migrateLegacy.ts packages/web/src/storage/unifiedDesktopDb.ts packages/web/src/storage/unifiedDesktopDb.test.ts
git commit -m "refactor: unify desktop core database filename"
```

### Task 7: Move The Desktop Core Store To The Shared Multi-User Schema

**Files:**
- Modify: `packages/web/src/storage/sqliteSchema.ts`
- Modify: `packages/web/src/storage/tauriSqliteStore.ts`
- Modify: `packages/web/src/storage/capacitorSqliteStore.ts`
- Create: `packages/web/src/storage/localUser.ts`
- Test: `packages/web/src/storage/tauriSqliteStore.test.ts`

- [ ] **Step 1: Write the failing schema expectation**

```ts
import { describe, expect, it } from 'vitest';
import { LOCAL_DESKTOP_USER_ID } from './localUser';

describe('localUser', () => {
  it('pins desktop local mode to a stable pseudo-user id', () => {
    expect(LOCAL_DESKTOP_USER_ID).toBe('local-desktop-user');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/web/src/storage/tauriSqliteStore.test.ts`

Expected: FAIL because `localUser.ts` does not exist or the schema has not been adapted.

- [ ] **Step 3: Add the local desktop user constant**

```ts
export const LOCAL_DESKTOP_USER_ID = 'local-desktop-user';
export const LOCAL_DESKTOP_USERNAME = 'local';
```

- [ ] **Step 4: Add `user_id` to shared core tables in desktop schema**

Update `sqliteSchema.ts` for:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ...
  PRIMARY KEY (user_id, id)
)
```

And similarly for `stream_entries`, `settings`, and any core tables shared with the server provider.

- [ ] **Step 5: Update Tauri store queries to always bind `LOCAL_DESKTOP_USER_ID`**

Replace patterns like:

```ts
SELECT * FROM tasks WHERE id = $1
```

With:

```ts
SELECT * FROM tasks WHERE user_id = $1 AND id = $2
```

and bind:

```ts
[LOCAL_DESKTOP_USER_ID, id]
```

- [ ] **Step 6: Apply the same query shape updates to Capacitor store**

Mirror the `user_id` filtering and inserts in `capacitorSqliteStore.ts`.

- [ ] **Step 7: Run targeted tests**

Run: `pnpm vitest run packages/web/src/storage/tauriSqliteStore.test.ts`

Expected: PASS

- [ ] **Step 8: Run the broader app tests most likely to catch schema regressions**

Run: `pnpm vitest run packages/web/src/stores/authStore.test.ts packages/web/src/sync/serverProbe.test.ts`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/storage/sqliteSchema.ts packages/web/src/storage/tauriSqliteStore.ts packages/web/src/storage/capacitorSqliteStore.ts packages/web/src/storage/localUser.ts
git commit -m "refactor: align desktop core store with multi-user schema"
```

### Task 8: Wire Real Sidecar Start/Stop/Restart And Validate End-To-End

**Files:**
- Modify: `packages/web/src-tauri/src/embedded_host.rs`
- Modify: `packages/web/src/features/embedded-host/embeddedHostStore.ts`
- Modify: `packages/web/src/features/embedded-host/EmbeddedHostSettings.tsx`
- Modify: `packages/web/src/plugins/pluginServerRuntime.ts`
- Test: Rust tests in `packages/web/src-tauri/src/embedded_host.rs`

- [ ] **Step 1: Add failing Rust tests for runtime validation and state transitions**

```rust
#[test]
fn disabled_config_maps_to_inactive_state() {
    let state = EmbeddedHostRuntimeState::inactive();
    assert_eq!(state.status, "inactive");
    assert!(state.base_url.is_none());
}
```

- [ ] **Step 2: Run Rust test to verify it fails**

Run: `cargo test -p my-little-todo embedded_host`

Expected: FAIL because helper/state transition code does not exist.

- [ ] **Step 3: Implement `start`, `stop`, and `restart` Tauri commands**

Add commands like:

```rust
#[tauri::command]
pub fn embedded_host_start(app: AppHandle, config: EmbeddedHostRuntimeConfig) -> Result<EmbeddedHostRuntimeState, String> { /* spawn sidecar, health-check, update state */ }

#[tauri::command]
pub fn embedded_host_stop(app: AppHandle) -> Result<EmbeddedHostRuntimeState, String> { /* kill child, clear state */ }

#[tauri::command]
pub fn embedded_host_restart(app: AppHandle, config: EmbeddedHostRuntimeConfig) -> Result<EmbeddedHostRuntimeState, String> { /* stop then start */ }
```

- [ ] **Step 4: Wire the frontend store to these commands**

```ts
const state = await invoke<EmbeddedHostRuntimeState>('embedded_host_start', { config });
set({ status: state.status, lastError: state.lastError });
```

And similarly for stop / restart.

- [ ] **Step 5: Surface exact runtime status in the settings page**

Add explicit states:

```tsx
<div>{runtime.status === 'running' ? `Running at ${runtime.baseUrl}` : 'Embedded host is disabled.'}</div>
```

- [ ] **Step 6: Run Rust tests**

Run: `cargo test -p my-little-todo embedded_host`

Expected: PASS

- [ ] **Step 7: Run frontend tests**

Run: `pnpm vitest run packages/web/src/features/embedded-host/EmbeddedHostSettings.test.tsx packages/web/src/plugins/pluginServerRuntime.test.ts`

Expected: PASS

- [ ] **Step 8: Run repository verification commands**

Run: `cargo test -p mlt-server -p mlt-desktop-host`

Expected: PASS

Run: `pnpm vitest run packages/web/src/features/embedded-host packages/web/src/plugins/pluginServerRuntime.test.ts`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/web/src-tauri/src/embedded_host.rs packages/web/src/features/embedded-host packages/web/src/plugins/pluginServerRuntime.ts
git commit -m "feat: run desktop embedded host as managed sidecar"
```

### Task 9: Final Documentation And Manual Verification Notes

**Files:**
- Modify: `README.md`
- Modify: `README-CN.md`
- Modify: `docs/development/building.md`
- Modify: `docs/plugins/README.md`

- [ ] **Step 1: Update README desktop/runtime wording**

Add language clarifying:

```md
- Desktop keeps a local-first main runtime.
- The embedded host is optional and can be fully disabled.
- When enabled, it can expose local API/MCP endpoints for other software.
```

- [ ] **Step 2: Update build docs for the new desktop host binary**

Add:

```md
cargo build --release -p mlt-desktop-host
```

- [ ] **Step 3: Update plugin docs to state that desktop server plugins require embedded host**

```md
On Tauri desktop, third-party server plugins require the embedded host module to be enabled and running.
```

- [ ] **Step 4: Run docs smoke verification**

Run: `pnpm lint`

Expected: PASS or no new docs-related lint failures from these edits.

- [ ] **Step 5: Commit**

```bash
git add README.md README-CN.md docs/development/building.md docs/plugins/README.md
git commit -m "docs: describe optional desktop embedded host"
```
