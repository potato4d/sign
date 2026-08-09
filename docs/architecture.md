# Architecture

This document is the durable contract for the desktop application foundation. Runtime behavior is
defined by code and executable tests; this document records the boundaries and invariants that
future changes must preserve.

## Goals

- Keep privileged Electron capabilities out of browser-rendered code.
- Make each cross-process capability explicit, typed, and small.
- Fill the renderer with a focused Monaco editing surface.
- Open explicitly supplied files as tabs without exposing filesystem APIs to the renderer.
- Keep a bounded, persistent list of recently edited files without exposing generic path reads.
- Deny navigation, new windows, embedded web views, and permissions by default.
- Keep development and verification commands discoverable from `package.json`.
- Add product-specific layers only when a concrete feature requires them.

## Non-goals

- A product domain model or a project-wide workspace abstraction.
- Remote content, external navigation, telemetry, or automatic updates.
- A UI framework or general-purpose dependency injection container.
- Release signing, notarization, or publication.

## Runtime boundaries

| Boundary | Responsibility                                                            | May depend on                       |
| -------- | ------------------------------------------------------------------------- | ----------------------------------- |
| Main     | Application lifecycle, native windows, permissions, privileged operations | Electron, Node.js, shared contracts |
| Preload  | A narrow, capability-oriented bridge                                      | Electron IPC, shared contracts      |
| Renderer | Browser UI and user interaction                                           | Web APIs, shared contracts          |
| Shared   | Serializable types, channel names, and pure validation                    | No runtime-specific API             |

Dependencies point toward `shared`; the renderer never imports Electron or Node.js. The preload
bridge exposes named functions rather than raw IPC primitives. Main-process handlers accept calls
only from the expected window and its main frame.

## Startup file flow

1. The main process resolves every unique command-line argument that points to an existing regular
   file. In development it skips the Electron application entry and command switches.
2. Window drops, macOS `open-file` events, second application launches, and the native multi-file
   dialog enter the same loading flow. The packaged CLI forwards its already-resolved file list
   through Electron's single-instance data so argument order and the invoking terminal's working
   directory remain stable. The macOS bundle advertises alternate editor support for `public.data`,
   allowing Finder to send regular files regardless of filename extension without claiming the
   default application role.
3. The main process reads at most 20 MiB of valid UTF-8 text per file.
4. For a window drop, preload converts only operating-system-backed browser `File` objects to paths
   with Electron's dedicated utility. A serializable workspace state then crosses the narrow
   preload bridge. It contains the ordered open documents, active path, and latest open error; the
   renderer never receives a generic path-open or file-read capability.
5. Monaco creates a model for the active document and creates inactive models on first selection.
   Each model receives a stable internal URI. Language mode is inferred from the visible file name
   and updated after Save As without replacing the model.

Files selected from the recent-files pane re-enter this same loading flow. Renderer entries carry
display metadata and an opaque identifier; main resolves that identifier only against its current
authoritative recent-file list before reading a path.

When open requests overlap, every unique document is retained, but only the newest request may take
focus or replace the visible error state.

## Command-line launcher

- Packaging places the executable POSIX launcher at `Contents/Resources/bin/sign`, outside the
  application archive but inside the signed app bundle.
- The packaged macOS application menu offers an explicit install action. It creates an absolute
  symlink at `/usr/local/bin/sign`, uses administrator authorization only when normal filesystem
  access is insufficient, and verifies the resulting link.
- Installation is idempotent for the current launcher and refuses to replace any regular file or
  link with a different target. App Translocation paths are rejected because they are temporary.
- The launcher resolves its installed symlink, starts `Contents/MacOS/sign` detached from the
  terminal, preserves argument boundaries and the terminal working directory, and returns
  immediately. File arguments then enter the same startup and single-instance validation as Finder
  and native-open requests.

## Tab ownership

- Main is the source of truth for document identity, tab order, the active document, file paths, and
  close operations.
- Renderer owns Monaco models and keeps their in-memory edits, cursor state, and undo history while
  tabs remain open.
- Reopening an existing path activates its current model rather than replacing unsaved edits with a
  new disk read.
- Renderer requests activation, saving, and closure only for document identifiers already present
  in the workspace.
- Main writes only to a path that was explicitly opened or selected in a native save dialog.
- A successful save moves that file to the front of a versioned recent-file list stored under the
  application user-data directory. The list is validated on load, written atomically, and capped at
  20 entries; failed or cancelled saves do not change it.
- Closing a modified model requires an explicit save, discard, or cancel decision.
- Closed file-backed tabs are reloaded through the normal size and UTF-8 checks. Unsaved tabs reopen
  from their last saved in-memory state.

## Command routing

- The native application menu defines desktop-level commands and their canonical accelerators.
- Menu actions send an allowlisted command value through the preload bridge; arbitrary command names
  are rejected.
- Renderer key handling adds platform-specific tab aliases, including `Command-T` for a new
  document on macOS, `Command-\` for the recent-files pane, plus relative and direct tab
  selection.
- Monaco remains authoritative for text-editing bindings such as undo, search, replacement, folding,
  comments, and multiple cursors.
- Zoom and full-screen behavior use native Electron roles.
- Closing from an empty workspace requests application termination through a dedicated capability.
  Main accepts that request only while its authoritative workspace contains no documents.

## Window chrome

- macOS uses an inset hidden title bar so renderer chrome reaches the top edge while the native
  close, minimize, and zoom buttons remain owned by the operating system.
- The tab bar is the window drag region. Tabs and toolbar buttons explicitly opt out so they remain
  interactive, and the leading inset keeps content clear of the native window buttons.
- Other platforms retain their native title bars until equivalent window controls are implemented.

## Resource use

- An empty workspace renders the lightweight application shell without loading Monaco. The editor
  runtime is loaded once, when the first document becomes active.
- Tabs that have never been selected retain their source contents in main-process state without
  allocating a Monaco model, undo stack, or language worker.
- Renderer-initiated mutations apply the state returned by IPC. State-change events are reserved
  for operating-system and second-instance file opens so large document contents are not cloned and
  rendered twice.
- Production renderer assets are minified, and the private application protocol enables Chromium's
  code cache for faster repeat launches.

## Security invariants

- Renderer sandboxing and context isolation remain enabled.
- Node.js integration, embedded web views, insecure content, and production developer tools remain
  disabled.
- The application serves bundled renderer assets from a private, standard custom protocol.
  Development navigation is limited to the configured local origin; packaged navigation is limited
  to the private application origin.
- New windows and permission requests are denied until a feature defines and tests a narrower
  policy.
- File contents come only from an explicit startup, native dialog, operating-system open,
  operating-system-backed drop, or authoritative recent-file request. Renderer code cannot request
  arbitrary paths.
- A recent-file request contains only an opaque identifier. Main rejects identifiers that are not
  in its bounded in-memory list, then applies the same regular-file, size, and UTF-8 checks as every
  other open flow.
- Content Security Policy limits scripts and resources to the application. Development WebSocket
  connections exist only to support local rebuilds. The renderer does not receive the broader
  privileges associated with `file://` pages.
- Packaging uses an archive and disables Electron execution paths that are not needed by the app.

Any change that relaxes an invariant must update the code, tests, and this document together.

## Sources of truth

| Concern                      | Authoritative source                   |
| ---------------------------- | -------------------------------------- |
| Runtime behavior             | `src/` and its tests                   |
| Process contracts            | `src/shared/desktop-api.ts`            |
| Startup file policy          | `src/main/startup-file.ts`             |
| CLI installation policy      | `src/main/cli-launcher.ts`             |
| Packaged CLI entry point     | `resources/bin/sign`                   |
| Tab state transitions        | `src/main/workspace-state.ts`          |
| Recent-file persistence      | `src/main/recent-files.ts`             |
| Tool versions                | `package.json` and `package-lock.json` |
| Verification commands        | `package.json` scripts                 |
| Packaging and security fuses | `scripts/package.mjs`                  |
| Packaged license notices     | Installed dependency license files     |

Historical notes should not replace these current sources. Add a decision record only when a choice
will materially constrain future implementation, release, or recovery work.

## Verification

Run focused tests while iterating, then run the full local gate:

```sh
npm run check
npm run package
```

The first command proves formatting, lint, static types, and unit behavior. The second proves that
the current platform can produce an application bundle. A distributable still requires
platform-specific signing and release verification.
