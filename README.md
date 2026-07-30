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
- Closing a modified tab offers to save, discard, or cancel.
- Reopening a saved file reads its current contents from disk.

## Keyboard shortcuts

The application menu is the source of truth for desktop-level shortcuts. Monaco keeps its built-in
editing bindings for undo, redo, search, replace, navigation, comments, folding, and multiple
cursors.

| Action                | macOS                                                                                                      | Windows / Linux                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| New file              | <kbd>Command</kbd>+<kbd>N</kbd>                                                                            | <kbd>Control</kbd>+<kbd>N</kbd>                                                             |
| Open files            | <kbd>Command</kbd>+<kbd>O</kbd>                                                                            | <kbd>Control</kbd>+<kbd>O</kbd>                                                             |
| Save                  | <kbd>Command</kbd>+<kbd>S</kbd>                                                                            | <kbd>Control</kbd>+<kbd>S</kbd>                                                             |
| Save as               | <kbd>Command</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>                                                           | <kbd>Control</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>                                            |
| Close current tab     | <kbd>Command</kbd>+<kbd>W</kbd>                                                                            | <kbd>Control</kbd>+<kbd>W</kbd>                                                             |
| Reopen closed tab     | <kbd>Command</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>                                                           | <kbd>Control</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>                                            |
| Quick switcher        | <kbd>Command</kbd>+<kbd>P</kbd>                                                                            | <kbd>Control</kbd>+<kbd>P</kbd>                                                             |
| Command palette       | <kbd>Command</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>                                                           | <kbd>Control</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>                                            |
| Next tab              | <kbd>Control</kbd>+<kbd>Tab</kbd> or <kbd>Command</kbd>+<kbd>Option</kbd>+<kbd>Right</kbd>                 | <kbd>Control</kbd>+<kbd>Tab</kbd> or <kbd>Control</kbd>+<kbd>Page Down</kbd>                |
| Previous tab          | <kbd>Control</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd> or <kbd>Command</kbd>+<kbd>Option</kbd>+<kbd>Left</kbd> | <kbd>Control</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd> or <kbd>Control</kbd>+<kbd>Page Up</kbd> |
| Select tab 1–8 / last | <kbd>Command</kbd>+<kbd>1–8</kbd> / <kbd>Command</kbd>+<kbd>9</kbd>                                        | <kbd>Control</kbd>+<kbd>1–8</kbd> / <kbd>Control</kbd>+<kbd>9</kbd>                         |
| Toggle word wrap      | <kbd>Option</kbd>+<kbd>Z</kbd>                                                                             | <kbd>Alt</kbd>+<kbd>Z</kbd>                                                                 |
| Zoom in/out/reset     | <kbd>Command</kbd>+<kbd>=/-/0</kbd>                                                                        | <kbd>Control</kbd>+<kbd>=/-/0</kbd>                                                         |

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

The editor opens and saves UTF-8 regular files up to 20 MiB each. Tab switches preserve edits,
cursor positions, and undo history. New files remain in memory until their first save, which opens a
native save dialog.

The packaged folder is intended for local verification. macOS packages receive an ad-hoc signature
so they can run locally; trusted distribution signing and installer creation belong to a separate
release workflow. Third-party license notices are included in the packaged application archive.
