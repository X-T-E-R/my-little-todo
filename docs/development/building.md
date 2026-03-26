# Build Guide

> Each build target has different storage characteristics. See notes below each section.

## Desktop Installer (Tauri)

Build platform-specific installers (MSI/EXE on Windows, DMG on macOS, AppImage on Linux):

```bash
pnpm --filter @my-little-todo/web build
```

Output will be in `packages/web/src-tauri/target/release/bundle/`.

**Storage**: Local SQLite via `@tauri-apps/plugin-sql`. No server needed. Data stored in the app's data directory.

## Android App (Capacitor)

Prerequisites: **JDK 17** on `PATH` or `JAVA_HOME` set (Android Studio bundles one — e.g. on Windows: `C:\Program Files\Android\Android Studio\jbr`).

From repo root:

```bash
pnpm install
pnpm turbo run build --filter=@my-little-todo/core
pnpm --filter @my-little-todo/mobile build
pnpm --filter @my-little-todo/mobile exec npx cap sync android
```

Then either open **`packages/mobile/android`** in Android Studio and use **Build → Build Bundle(s) / APK(s)**, or from a shell:

```bash
cd packages/mobile/android
# Debug APK (signed with debug keystore; good for device testing)
./gradlew assembleDebug
# Windows: gradlew.bat assembleDebug
```

Release APK on CI uses repository secrets `MLT_KEYSTORE_*`; locally, omit those env vars and Gradle builds an **unsigned** release APK, or configure signing in Android Studio.

**Storage**: Local SQLite via `@capacitor-community/sqlite`. Auto-update checks against GitHub Releases.

## Standalone Server Binary

```bash
cargo build --release -p mlt-server-bin
```

Output: `target/release/mlt-server`

**Storage**: Server-side database (SQLite/PostgreSQL/MySQL). Web clients connect via REST API. Also serves as a sync target for native clients.

## Admin Panel

```bash
pnpm build:admin
```

Output: `packages/admin/dist/`

> Admin panel is for server mode only. Native clients don't need it.

## PWA

```bash
pnpm build:pwa
```

Output: `packages/web/dist-pwa/`

**Storage**: Uses `ApiDataStore` — all data lives on the server.

## Full Server Deployment Build

To build everything needed for a server deployment:

```bash
pnpm install

# Server binary
cargo build --release -p mlt-server-bin

# Frontend assets
pnpm --filter @my-little-todo/core build
pnpm --filter @my-little-todo/web build:vite
pnpm build:admin

# Assemble static files
mkdir -p static/admin
cp -r packages/web/dist/* static/
cp -r packages/admin/dist/* static/admin/
```

See [deployment/binary.md](../deployment/binary.md) for running the server.
