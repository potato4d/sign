import { describe, expect, it } from 'vitest';

import { loadFile, resolveStartupFilePaths } from './startup-file';

describe('resolveStartupFilePaths', () => {
  const existingFile = '/workspace/notes/example.ts';
  const secondFile = '/workspace/notes/example.json';
  const extensionlessFile = '/workspace/notes/README';
  const unknownExtensionFile = '/workspace/notes/example.unregistered-extension';
  const isFile = (candidate: string): boolean =>
    candidate === existingFile ||
    candidate === secondFile ||
    candidate === extensionlessFile ||
    candidate === unknownExtensionFile;

  it('finds packaged application file arguments in order', () => {
    expect(
      resolveStartupFilePaths({
        argv: ['/Applications/Winzig', existingFile, secondFile, existingFile],
        cwd: '/workspace',
        isFile,
        isPackaged: true,
      }),
    ).toEqual([existingFile, secondFile]);
  });

  it('skips the development entry and Electron switches', () => {
    expect(
      resolveStartupFilePaths({
        argv: ['/path/to/electron', '.', '--inspect=5858', '--', 'notes/example.ts'],
        cwd: '/workspace',
        isFile,
        isPackaged: false,
      }),
    ).toEqual([existingFile]);
  });

  it('returns an empty list when no regular file was provided', () => {
    expect(
      resolveStartupFilePaths({
        argv: ['/Applications/Winzig', '--no-sandbox', '/workspace/missing.ts'],
        cwd: '/workspace',
        isFile,
        isPackaged: true,
      }),
    ).toEqual([]);
  });

  it('accepts extensionless and unregistered file names', () => {
    expect(
      resolveStartupFilePaths({
        argv: ['/Applications/Winzig', extensionlessFile, unknownExtensionFile],
        cwd: '/workspace',
        isFile,
        isPackaged: true,
      }),
    ).toEqual([extensionlessFile, unknownExtensionFile]);
  });
});

describe('loadFile', () => {
  it('loads UTF-8 text into a serializable editor document', async () => {
    const state = await loadFile(import.meta.filename);

    expect(state.kind).toBe('document');

    if (state.kind === 'document') {
      expect(state.document.fileName).toBe('startup-file.test.ts');
      expect(state.document.contents).toContain('loads UTF-8 text');
    }
  });

  it('rejects a file above the configured size limit', async () => {
    const state = await loadFile(import.meta.filename, { maximumFileSize: 1 });

    expect(state).toMatchObject({
      kind: 'error',
      message: 'The file is too large to open safely.',
    });
  });
});
