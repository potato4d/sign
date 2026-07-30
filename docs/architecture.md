# Architecture

This document is the durable contract for the desktop application foundation. Runtime behavior is
defined by code and executable tests; this document records the boundaries and invariants that
future changes must preserve.

## Goals

- Keep privileged Electron capabilities out of browser-rendered code.
- Make each cross-process capability explicit, typed, and small.
- Fill the renderer with a focused Monaco editing surface.
- Open explicitly supplied files as tabs without exposing filesystem APIs to the renderer.
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
2. macOS `open-file` events, second application launches, and the native multi-file dialog enter the
   same loading flow.
3. The main process reads at most 20 MiB of valid UTF-8 text per file.
4. A serializable workspace state crosses the narrow preload bridge. It contains the ordered open
   documents, active path, and latest open error; the renderer never receives a generic file-read
   capability.
5. Monaco creates one model per document with a stable internal URI. Language mode is inferred from
   the visible file name and updated after Save As without replacing the model.

When open requests overlap, every unique document is retained, but only the newest request may take
focus or replace the visible error state.

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
- Closing a modified model requires an explicit save, discard, or cancel decision.
- Closed file-backed tabs are reloaded through the normal size and UTF-8 checks. Unsaved tabs reopen
  from their last saved in-memory state.

## Command routing

- The native application menu defines desktop-level commands and their canonical accelerators.
- Menu actions send an allowlisted command value through the preload bridge; arbitrary command names
  are rejected.
- Renderer key handling adds only platform-specific tab-navigation aliases and direct tab selection.
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

## Security invariants

- Renderer sandboxing and context isolation remain enabled.
- Node.js integration, embedded web views, insecure content, and production developer tools remain
  disabled.
- The application serves bundled renderer assets from a private, standard custom protocol.
  Development navigation is limited to the configured local origin; packaged navigation is limited
  to the private application origin.
- New windows and permission requests are denied until a feature defines and tests a narrower
  policy.
- File contents come only from an explicit startup or operating-system open request. Renderer code
  cannot request arbitrary paths.
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
| Tab state transitions        | `src/main/workspace-state.ts`          |
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
