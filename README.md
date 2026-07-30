# Winzig

A small desktop text editor built with Electron, TypeScript, and Monaco Editor.

## Features

- Open multiple UTF-8 text files in tabs.
- Create, edit, save, and reopen files.
- Open file paths passed at startup.
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

## Version

The initial version is `0.1.0`.

## License

[MIT](LICENSE)
