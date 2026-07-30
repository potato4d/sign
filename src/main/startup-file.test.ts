import { describe, expect, it } from 'vitest';

import { loadEditorState, resolveStartupFilePath } from './startup-file';

describe('resolveStartupFilePath', () => {
  const existingFile = '/workspace/notes/example.ts';
  const isFile = (candidate: string): boolean => candidate === existingFile;

  it('finds a packaged application file argument', () => {
    expect(
      resolveStartupFilePath({
        argv: ['/Applications/Winzig', existingFile],
        cwd: '/workspace',
        isFile,
        isPackaged: true,
      }),
    ).toBe(existingFile);
  });

  it('skips the development entry and Electron switches', () => {
    expect(
      resolveStartupFilePath({
        argv: ['/path/to/electron', '.', '--inspect=5858', '--', 'notes/example.ts'],
        cwd: '/workspace',
        isFile,
        isPackaged: false,
      }),
    ).toBe(existingFile);
  });

  it('returns null when no regular file was provided', () => {
    expect(
      resolveStartupFilePath({
        argv: ['/Applications/Winzig', '--no-sandbox', '/workspace/missing.ts'],
        cwd: '/workspace',
        isFile,
        isPackaged: true,
      }),
    ).toBeNull();
  });
});

describe('loadEditorState', () => {
  it('loads UTF-8 text into a serializable editor document', async () => {
    const state = await loadEditorState(import.meta.filename);

    expect(state.kind).toBe('document');

    if (state.kind === 'document') {
      expect(state.document.fileName).toBe('startup-file.test.ts');
      expect(state.document.contents).toContain('loads UTF-8 text');
    }
  });

  it('rejects a file above the configured size limit', async () => {
    const state = await loadEditorState(import.meta.filename, { maximumFileSize: 1 });

    expect(state).toMatchObject({
      kind: 'error',
      message: 'The file is too large to open safely.',
    });
  });
});
