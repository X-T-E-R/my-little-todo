# Build Guide

## Desktop Installer (Tauri)

Build platform-specific installers (MSI/EXE on Windows, DMG on macOS, AppImage on Linux):

```bash
pnpm --filter @my-little-todo/web build
```

Output will be in `packages/web/src-tauri/target/release/bundle/`.

## Standalone Server Binary

```bash
cargo build --release -p mlt-server-bin
```

Output: `target/release/mlt-server`

## Admin Panel

```bash
pnpm build:admin
```

Output: `packages/admin/dist/`

## PWA

```bash
pnpm build:pwa
```

Output: `packages/web/dist-pwa/`

## Mobile App (Capacitor)

```bash
pnpm build:mobile
pnpm cap:sync
pnpm cap:open:android  # or cap:open:ios
```

Then compile and install from Android Studio or Xcode.

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
