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
  main/       Electron lifecycle, windows, permissions, and IPC handlers
  preload/    The narrow bridge exposed to the renderer
  renderer/   Browser-only UI code and styles
  shared/     Serializable contracts shared across process boundaries
docs/
  architecture.md
```

The current runtime boundaries, security invariants, and source-of-truth rules live in
[docs/architecture.md](docs/architecture.md).

The packaged folder is intended for local verification. macOS packages receive an ad-hoc signature
so they can run locally; trusted distribution signing and installer creation belong to a separate
release workflow.
