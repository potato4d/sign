# Architecture

This document is the durable contract for the desktop application foundation. Runtime behavior is
defined by code and executable tests; this document records the boundaries and invariants that
future changes must preserve.

## Goals

- Keep privileged Electron capabilities out of browser-rendered code.
- Make each cross-process capability explicit, typed, and small.
- Fill the renderer with a focused Monaco editing surface.
- Open an explicitly supplied startup file without exposing filesystem APIs to the renderer.
- Deny navigation, new windows, embedded web views, and permissions by default.
- Keep development and verification commands discoverable from `package.json`.
- Add product-specific layers only when a concrete feature requires them.

## Non-goals

- A product domain model, file persistence, or unsaved-change workflow.
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

1. The main process resolves the first command-line argument that points to an existing regular
   file. In development it skips the Electron application entry and command switches.
2. macOS `open-file` events enter the same flow. A second application launch forwards its file to
   the existing window.
3. The main process reads at most 20 MiB of valid UTF-8 text.
4. A serializable editor state crosses the narrow preload bridge. The renderer never receives a
   generic file-read capability.
5. Monaco creates a model whose URI is the absolute file path, allowing language inference from the
   file name.

When multiple open requests overlap, only the newest completed request may update the editor.

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
