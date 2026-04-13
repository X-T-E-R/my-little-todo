# Release Checklist

This checklist defines what the current release can safely promise, what stays Beta, and how to protect user data before upgrade, import, export, and sync changes.

## Stable Core Capabilities

The following capabilities are part of the current stable release boundary:

- Task CRUD
- Stream entry CRUD and search
- Authentication and multi-user isolation
- Basic attachment upload and download
- JSON import and export
- Local SQLite on desktop and Android/Capacitor
- API server sync
- WebDAV sync
- Upgrade migrations
- Core settings

## Beta And Limited Capabilities

The following capabilities remain outside the stable SLA and should not be the only recovery path for important data:

- AI assistant and AI agent flows
- Server-side backup and restore flows
- S3 sync and storage targets
- Window context
- Desktop widget
- Think session and work thread modules
- Third-party plugin ecosystem

If any Beta feature fails, the expected behavior is that the core Todo flows and existing local data remain usable.

## Release Gate Commands

Every release candidate must pass all of the following commands before tagging:

```bash
pnpm lint
pnpm typecheck
pnpm test:all
pnpm --filter @my-little-todo/web build:vite
```

Recommended extra build checks for a full release pass:

```bash
pnpm --filter @my-little-todo/mobile build
pnpm --filter @my-little-todo/admin build
cargo build -p mlt-server -p mlt-server-bin
```

## Backup Before Upgrade

Always recommend a backup before any upgrade, migration, or sync reconfiguration.

1. Open `Settings -> Data`.
2. Run a full JSON export.
3. Verify the export file is saved outside the app working directory if possible.
4. If attachments are important, keep the export together with the related blob storage or restore through the server import path first.
5. Upgrade only after the export file is confirmed readable.

## Export And Restore

JSON export is the only full-fidelity backup format for release recovery.

Export:

1. Open `Settings -> Data`.
2. Use the JSON export action.
3. Confirm the file contains the expected tasks, stream entries, settings, and blob metadata.

Restore:

1. Start with a clean environment or a disposable test account first.
2. Open `Settings -> Data`.
3. Import the exported JSON backup.
4. Verify tasks, stream entries, settings, and blob references are present.
5. Only then use the same backup for a real recovery.

Markdown export is for reading and transfer, not for full restoration.

## Release Validation

The release is considered publishable only after the following checks pass:

1. Upgrade from a previous version without losing tasks, stream entries, settings, or blob metadata.
2. Restart after an interrupted upgrade and confirm recovery completes.
3. Export JSON and restore it into a fresh environment.
4. Verify blob references still match the restored metadata.
5. Confirm local SQLite plus API/WebDAV sync does not silently overwrite conflicts.
6. Disable all Beta capabilities and confirm the core Todo product remains complete and usable.
7. Trigger a Beta capability failure and confirm core data and the main UI still work.
8. Confirm Android/Capacitor still uses the local SQLite path and does not fall back to the API store.

## Known Limits That Do Not Block First Release

- The remaining large editor-related chunk belongs to the on-demand editing path, not the initial core app entry.
- S3, server backup/restore, window context, desktop widget, and plugins are still Beta or limited.
- Desktop installer upgrade flow and Android real-device upgrade flow still require manual release acceptance in a real environment.

