# Winzig

A small desktop text editor built with Electron, TypeScript, and Monaco Editor.

## Installation

Winzig `0.3.1` supports Macs with Apple silicon running macOS 12 or later.

```sh
brew install --cask potato4d/tap/winzig
```

The current release is not signed with a Developer ID or notarized. If macOS
blocks the first launch, open the Applications folder in Finder, Control-click
Winzig, choose **Open**, and confirm. If **Open** is not offered, allow Winzig
from **System Settings > Privacy & Security** and try again.

## Features

- Open multiple UTF-8 text files in tabs.
- Create, edit, save, and reopen files.
- Open file paths passed at startup.
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

The current release is `0.3.1`.

## License

[MIT](LICENSE)
