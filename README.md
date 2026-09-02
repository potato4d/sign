# sign

A small desktop text editor built with Electron, TypeScript, and Monaco Editor.

## Installation

sign `0.3.9` supports Macs with Apple silicon running macOS 12 or later.

```sh
brew install --cask potato4d/tap/sign
```

The current release is not signed with a Developer ID or notarized. If macOS
blocks the first launch, open the Applications folder in Finder, Control-click
sign, choose **Open**, and confirm. If **Open** is not offered, allow sign
from **System Settings > Privacy & Security** and try again.

To launch sign from a terminal, open the **sign** application menu and choose
**Install 'sign' Command in PATH…**. macOS may ask for an administrator password.
The installer creates `/usr/local/bin/sign` and never overwrites an existing
command. Open a new terminal after installation, then run:

```sh
sign /absolute/path/to/file.ts /absolute/path/to/another.json
```

The command follows the installed application. If you move `sign.app`, first
confirm that `readlink /usr/local/bin/sign` points into the old `sign.app`, remove
that stale link, then install the command again from the menu.

## Features

- Open multiple UTF-8 text files in tabs.
- Create, edit, save, and reopen files.
- Reopen up to 20 recently edited files from a `Command+\` side pane.
- Open file paths passed at startup.
- Install and launch the app from a terminal with `sign <file>`.
- Drop files onto the window or macOS app icon, regardless of filename extension.
- Use familiar desktop editing and tab shortcuts.
- Keep native macOS window controls with an integrated tab bar.

## Development

Requires Node.js 24 and npm 11 or later.

```sh
npm install
npm start
```

To open files at startup:

```sh
npm start -- /absolute/path/to/file.ts /absolute/path/to/another.json
```

## Commands

```sh
npm test
npm run check
npm run package
```

Architecture and security notes are available in
[docs/architecture.md](docs/architecture.md).

## Release

The current release is `0.3.9`.

## License

[MIT](LICENSE)
