# Winzig

A small Electron and TypeScript foundation with explicit runtime boundaries and secure defaults.

## Requirements

- Node.js 24
- npm 11 or later

## Getting started

```sh
npm install
npm start
```

Open a UTF-8 text file at startup:

```sh
npm start -- /absolute/path/to/file.ts
```

The packaged executable accepts the file path as its first argument. Passing a file to a running
instance focuses its existing window and opens the latest requested file.

## Commands

| Command           | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `npm start`       | Run the app with Vite development rebuilds             |
| `npm test`        | Run the unit tests once                                |
| `npm run check`   | Check formatting, lint, types, and tests               |
| `npm run package` | Build an unpacked application for the current platform |

## Project map

```text
src/
  main/       Electron lifecycle, startup files, windows, permissions, and IPC handlers
  preload/    The narrow bridge exposed to the renderer
  renderer/   Browser-only UI code and styles
  shared/     Serializable contracts shared across process boundaries
docs/
  architecture.md
```

The current runtime boundaries, security invariants, and source-of-truth rules live in
[docs/architecture.md](docs/architecture.md).

The editor opens UTF-8 regular files up to 20 MiB. Editing is currently in-memory; saving and
unsaved-change protection are not implemented yet.

The packaged folder is intended for local verification. macOS packages receive an ad-hoc signature
so they can run locally; trusted distribution signing and installer creation belong to a separate
release workflow. Third-party license notices are included in the packaged application archive.
