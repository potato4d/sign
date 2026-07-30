import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writeDocumentFile } from './document-file';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'winzig-save-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('writeDocumentFile', () => {
  it('writes UTF-8 text to the selected path', async () => {
    const directory = await createTemporaryDirectory();
    const filePath = join(directory, 'saved.txt');

    await expect(writeDocumentFile(filePath, 'hello 世界')).resolves.toEqual({
      kind: 'saved',
    });
    await expect(readFile(filePath, 'utf8')).resolves.toBe('hello 世界');
  });

  it('rejects contents above the byte limit without creating the file', async () => {
    const directory = await createTemporaryDirectory();
    const filePath = join(directory, 'too-large.txt');

    await expect(writeDocumentFile(filePath, '世界', 5)).resolves.toEqual({
      kind: 'error',
      message: 'The document is too large to save safely.',
    });
    await expect(readFile(filePath, 'utf8')).rejects.toThrow();
  });
});
