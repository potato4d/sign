import { readFile, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import type { FileOpenResult } from '../shared/desktop-api';

const DEFAULT_MAXIMUM_FILE_SIZE = 20 * 1024 * 1024;

interface ResolveStartupFileOptions {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly isFile?: (candidate: string) => boolean;
  readonly isPackaged: boolean;
}

interface LoadEditorStateOptions {
  readonly maximumFileSize?: number;
}

const isRegularFile = (candidate: string): boolean => {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
};

export const resolveStartupFilePaths = ({
  argv,
  cwd,
  isFile = isRegularFile,
  isPackaged,
}: ResolveStartupFileOptions): readonly string[] => {
  const applicationDirectory = path.resolve(cwd);
  const filePaths: string[] = [];
  const seenFilePaths = new Set<string>();
  let reachedArgumentSeparator = false;

  for (const argument of argv.slice(1)) {
    if (argument === '--') {
      reachedArgumentSeparator = true;
      continue;
    }

    if (!reachedArgumentSeparator && argument.startsWith('-')) {
      continue;
    }

    const candidate = path.resolve(cwd, argument);

    if (!isPackaged && candidate === applicationDirectory) {
      continue;
    }

    if (isFile(candidate) && !seenFilePaths.has(candidate)) {
      seenFilePaths.add(candidate);
      filePaths.push(candidate);
    }
  }

  return filePaths;
};

const errorResult = (filePath: string, message: string): FileOpenResult => ({
  filePath,
  kind: 'error',
  message,
});

export const loadFile = async (
  filePath: string,
  { maximumFileSize = DEFAULT_MAXIMUM_FILE_SIZE }: LoadEditorStateOptions = {},
): Promise<FileOpenResult> => {
  const absolutePath = path.resolve(filePath);

  try {
    const metadata = await stat(absolutePath);

    if (!metadata.isFile()) {
      return errorResult(absolutePath, 'The requested path is not a regular file.');
    }

    if (metadata.size > maximumFileSize) {
      return errorResult(absolutePath, 'The file is too large to open safely.');
    }

    const bytes = await readFile(absolutePath);
    const contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes);

    return {
      document: {
        contents,
        fileName: path.basename(absolutePath),
        filePath: absolutePath,
      },
      kind: 'document',
    };
  } catch (error: unknown) {
    const message =
      error instanceof TypeError
        ? 'The file is not valid UTF-8 text.'
        : 'The file could not be opened.';

    return errorResult(absolutePath, message);
  }
};
