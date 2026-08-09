import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';

import { MAXIMUM_RECENT_FILES, type RecentFile } from '../shared/desktop-api';

export const RECENT_FILES_STORAGE_VERSION = 1;
const MAXIMUM_RECENT_FILES_STORAGE_SIZE = 64 * 1024;

export interface RecentFileRecord {
  readonly filePath: string;
  readonly id: string;
}

interface StoredRecentFiles {
  readonly records: readonly RecentFileRecord[];
  readonly version: typeof RECENT_FILES_STORAGE_VERSION;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const recentFileRecordFrom = (value: unknown): RecentFileRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = value['id'];
  const filePath = value['filePath'];

  if (
    typeof id !== 'string' ||
    !UUID_PATTERN.test(id) ||
    typeof filePath !== 'string' ||
    !isAbsolute(filePath) ||
    filePath.includes('\0')
  ) {
    return null;
  }

  return { filePath, id };
};

const sanitizeRecentFiles = (values: readonly unknown[]): readonly RecentFileRecord[] => {
  const records: RecentFileRecord[] = [];
  const ids = new Set<string>();
  const filePaths = new Set<string>();

  for (const value of values) {
    const record = recentFileRecordFrom(value);

    if (!record || ids.has(record.id) || filePaths.has(record.filePath)) {
      continue;
    }

    records.push(record);
    ids.add(record.id);
    filePaths.add(record.filePath);

    if (records.length === MAXIMUM_RECENT_FILES) {
      break;
    }
  }

  return records;
};

export const touchRecentFile = (
  records: readonly RecentFileRecord[],
  filePath: string,
  createId: () => string = randomUUID,
): readonly RecentFileRecord[] => {
  if (!isAbsolute(filePath) || filePath.includes('\0')) {
    throw new TypeError('Recent file paths must be absolute and cannot contain NUL bytes.');
  }

  const sanitizedRecords = sanitizeRecentFiles(records);
  const existingRecord = sanitizedRecords.find((record) => record.filePath === filePath);

  if (existingRecord) {
    return [
      existingRecord,
      ...sanitizedRecords.filter((record) => record.id !== existingRecord.id),
    ];
  }

  const id = createId();

  if (!UUID_PATTERN.test(id)) {
    throw new TypeError('Recent file IDs must be UUIDs.');
  }

  return [{ filePath, id }, ...sanitizedRecords].slice(0, MAXIMUM_RECENT_FILES);
};

export const findRecentFileById = (
  records: readonly RecentFileRecord[],
  id: string,
): RecentFileRecord | undefined => records.find((record) => record.id === id);

export const toRecentFileView = (record: RecentFileRecord): RecentFile => ({
  directoryPath: dirname(record.filePath),
  fileName: basename(record.filePath),
  id: record.id,
});

export const loadRecentFiles = async (
  storageFilePath: string,
): Promise<readonly RecentFileRecord[]> => {
  let storedValue: unknown;

  try {
    const storageFile = await open(storageFilePath, 'r');

    try {
      const metadata = await storageFile.stat();

      if (!metadata.isFile() || metadata.size > MAXIMUM_RECENT_FILES_STORAGE_SIZE) {
        return [];
      }

      storedValue = JSON.parse(await storageFile.readFile('utf8')) as unknown;
    } finally {
      await storageFile.close();
    }
  } catch {
    return [];
  }

  if (
    !isRecord(storedValue) ||
    storedValue['version'] !== RECENT_FILES_STORAGE_VERSION ||
    !Array.isArray(storedValue['records'])
  ) {
    return [];
  }

  return sanitizeRecentFiles(storedValue['records']);
};

export const saveRecentFiles = async (
  storageFilePath: string,
  records: readonly RecentFileRecord[],
): Promise<void> => {
  const storageDirectory = dirname(storageFilePath);
  const temporaryFilePath = join(
    storageDirectory,
    `.recent-files-${process.pid}-${randomUUID()}.tmp`,
  );
  const storedValue: StoredRecentFiles = {
    records: sanitizeRecentFiles(records),
    version: RECENT_FILES_STORAGE_VERSION,
  };
  const serializedValue = `${JSON.stringify(storedValue, null, 2)}\n`;

  await mkdir(storageDirectory, { recursive: true });

  try {
    const temporaryFile = await open(temporaryFilePath, 'wx', 0o600);

    try {
      await temporaryFile.writeFile(serializedValue, 'utf8');
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }

    await rename(temporaryFilePath, storageFilePath);
  } finally {
    await rm(temporaryFilePath, { force: true }).catch(() => undefined);
  }
};
