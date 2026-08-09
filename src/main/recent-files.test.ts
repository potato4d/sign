import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAXIMUM_RECENT_FILES } from '../shared/desktop-api';

import {
  RECENT_FILES_STORAGE_VERSION,
  findRecentFileById,
  loadRecentFiles,
  saveRecentFiles,
  toRecentFileView,
  touchRecentFile,
  type RecentFileRecord,
} from './recent-files';

type RenameFile = (oldPath: string | Buffer | URL, newPath: string | Buffer | URL) => Promise<void>;

const { renameMock } = vi.hoisted(() => ({
  renameMock: vi.fn<RenameFile>(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const fileSystem = await importOriginal<Record<string, unknown>>();
  const renameFile = fileSystem['rename'];

  if (typeof renameFile !== 'function') {
    throw new TypeError('node:fs/promises.rename is unavailable.');
  }

  renameMock.mockImplementation(renameFile as RenameFile);

  return {
    ...fileSystem,
    rename: renameMock,
  };
});

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'sign-recent-files-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

const uuidFor = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

afterEach(async () => {
  renameMock.mockClear();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('recent file records', () => {
  it('moves a touched path to the front, preserves its ID, and caps the list at 20', () => {
    let records: readonly RecentFileRecord[] = [];

    for (let index = 0; index <= MAXIMUM_RECENT_FILES; index += 1) {
      records = touchRecentFile(records, `/workspace/file-${index}.txt`, () => uuidFor(index));
    }

    expect(records).toHaveLength(MAXIMUM_RECENT_FILES);
    expect(records.map((record) => record.filePath)).toEqual(
      Array.from(
        { length: MAXIMUM_RECENT_FILES },
        (_, index) => `/workspace/file-${MAXIMUM_RECENT_FILES - index}.txt`,
      ),
    );

    const existingRecord = records[7];
    expect(existingRecord).toBeDefined();

    if (!existingRecord) {
      return;
    }

    const reordered = touchRecentFile(records, existingRecord.filePath, () => {
      throw new Error('An existing record must not receive a new ID.');
    });

    expect(reordered).toHaveLength(MAXIMUM_RECENT_FILES);
    expect(reordered[0]).toEqual(existingRecord);
    expect(reordered.filter((record) => record.filePath === existingRecord.filePath)).toHaveLength(
      1,
    );
  });

  it('looks up records by opaque ID and exposes only renderer-safe path parts', () => {
    const record: RecentFileRecord = {
      filePath: '/workspace/notes/example.txt',
      id: uuidFor(1),
    };

    expect(findRecentFileById([record], record.id)).toBe(record);
    expect(findRecentFileById([record], uuidFor(2))).toBeUndefined();
    expect(toRecentFileView(record)).toEqual({
      directoryPath: '/workspace/notes',
      fileName: 'example.txt',
      id: record.id,
    });
    expect(toRecentFileView(record)).not.toHaveProperty('filePath');
  });

  it('rejects non-absolute paths and non-UUID generated IDs', () => {
    expect(() => touchRecentFile([], 'relative.txt')).toThrow(TypeError);
    expect(() => touchRecentFile([], '/workspace/valid.txt', () => 'predictable-id')).toThrow(
      TypeError,
    );
  });
});

describe('recent file persistence', () => {
  it('treats missing, malformed, and unsupported storage as empty', async () => {
    const directory = await createTemporaryDirectory();
    const storageFilePath = join(directory, 'recent-files.json');

    await expect(loadRecentFiles(storageFilePath)).resolves.toEqual([]);

    await writeFile(storageFilePath, ' '.repeat(64 * 1024 + 1), 'utf8');
    await expect(loadRecentFiles(storageFilePath)).resolves.toEqual([]);

    await writeFile(storageFilePath, '{not json', 'utf8');
    await expect(loadRecentFiles(storageFilePath)).resolves.toEqual([]);

    await writeFile(
      storageFilePath,
      JSON.stringify({ records: [], version: RECENT_FILES_STORAGE_VERSION + 1 }),
      'utf8',
    );
    await expect(loadRecentFiles(storageFilePath)).resolves.toEqual([]);
  });

  it('recovers valid entries from mixed storage while enforcing unique IDs and paths', async () => {
    const directory = await createTemporaryDirectory();
    const storageFilePath = join(directory, 'recent-files.json');
    const first: RecentFileRecord = {
      filePath: '/workspace/first.txt',
      id: uuidFor(1),
    };
    const second: RecentFileRecord = {
      filePath: '/workspace/second.txt',
      id: uuidFor(2),
    };

    await writeFile(
      storageFilePath,
      JSON.stringify({
        records: [
          first,
          null,
          { filePath: 'relative.txt', id: uuidFor(3) },
          { filePath: '/workspace/invalid-id.txt', id: 'not-a-uuid' },
          { filePath: '/workspace/nul\0path.txt', id: uuidFor(4) },
          { filePath: '/workspace/duplicate-id.txt', id: first.id },
          { filePath: first.filePath, id: uuidFor(5) },
          second,
        ],
        version: RECENT_FILES_STORAGE_VERSION,
      }),
      'utf8',
    );

    await expect(loadRecentFiles(storageFilePath)).resolves.toEqual([first, second]);
  });

  it('round-trips versioned records and creates a missing storage directory', async () => {
    const directory = await createTemporaryDirectory();
    const storageFilePath = join(directory, 'state', 'recent-files.json');
    const records = [
      { filePath: '/workspace/first.txt', id: uuidFor(1) },
      { filePath: '/workspace/second.txt', id: uuidFor(2) },
    ];

    await saveRecentFiles(storageFilePath, records);

    await expect(loadRecentFiles(storageFilePath)).resolves.toEqual(records);
    await expect(readFile(storageFilePath, 'utf8')).resolves.toBe(
      `${JSON.stringify(
        {
          records,
          version: RECENT_FILES_STORAGE_VERSION,
        },
        null,
        2,
      )}\n`,
    );
    await expect(readdir(join(directory, 'state'))).resolves.toEqual(['recent-files.json']);
  });

  it('preserves the prior file and removes the temporary file when the atomic rename fails', async () => {
    const directory = await createTemporaryDirectory();
    const storageFilePath = join(directory, 'recent-files.json');
    const originalContents = '{"original":true}\n';

    await writeFile(storageFilePath, originalContents, 'utf8');
    renameMock.mockRejectedValueOnce(new Error('simulated rename failure'));

    await expect(
      saveRecentFiles(storageFilePath, [{ filePath: '/workspace/example.txt', id: uuidFor(1) }]),
    ).rejects.toThrow('simulated rename failure');

    await expect(readFile(storageFilePath, 'utf8')).resolves.toBe(originalContents);
    await expect(readdir(directory)).resolves.toEqual(['recent-files.json']);
  });
});
