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

Open one or more UTF-8 text files at startup:

```sh
npm start -- /absolute/path/to/file.ts /absolute/path/to/another.json
```

The packaged executable accepts file paths as arguments. Passing files to a running instance
focuses its existing window and opens them as tabs.

## Tabs

- Use the `+` button or <kbd>Command</kbd>/<kbd>Control</kbd>+<kbd>O</kbd> to select multiple files.
- Select a tab to switch while keeping its Monaco model, cursor position, and undo history.
- Use the close button or middle-click a tab to close it.
- Use <kbd>Control</kbd>+<kbd>Tab</kbd> and
  <kbd>Control</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd> to move between tabs.
- Closing a modified tab requires confirmation because saving is not implemented yet.

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

The editor opens UTF-8 regular files up to 20 MiB each. Editing is currently in-memory; tab switches
preserve edits, while closing a modified tab confirms that the changes will be discarded. Saving is
not implemented yet.

The packaged folder is intended for local verification. macOS packages receive an ad-hoc signature
so they can run locally; trusted distribution signing and installer creation belong to a separate
release workflow. Third-party license notices are included in the packaged application archive.
