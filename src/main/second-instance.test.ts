import { describe, expect, it } from 'vitest';

import { secondInstanceActionFor } from './second-instance';

describe('secondInstanceActionFor', () => {
  it('reopens a window for a windowless app even without file arguments', () => {
    expect(secondInstanceActionFor([], false)).toEqual({
      filePaths: [],
      kind: 'ensure-window',
    });
  });

  it('queues files while reopening a windowless app', () => {
    expect(secondInstanceActionFor(['/workspace/notes.txt'], false)).toEqual({
      filePaths: ['/workspace/notes.txt'],
      kind: 'ensure-window',
    });
  });

  it('focuses an existing window when no files were supplied', () => {
    expect(secondInstanceActionFor([], true)).toEqual({ kind: 'focus-window' });
  });

  it('opens files in an existing window', () => {
    expect(secondInstanceActionFor(['/workspace/notes.txt'], true)).toEqual({
      filePaths: ['/workspace/notes.txt'],
      kind: 'open-files',
    });
  });
});
