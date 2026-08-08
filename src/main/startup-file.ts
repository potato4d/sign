import { readFile, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { randomUUID } from 'node:crypto';

import type { FileOpenResult } from '../shared/desktop-api';

import { MAXIMUM_FILE_SIZE } from './file-policy';

interface ResolveStartupFileOptions {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly isFile?: (candidate: string) => boolean;
  readonly isPackaged: boolean;
}

interface LoadEditorStateOptions {
  readonly maximumFileSize?: number;
}

interface ResolveSecondInstanceFileOptions extends ResolveStartupFileOptions {
  readonly additionalData: unknown;
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

const forwardedFilePathsFrom = (additionalData: unknown): readonly string[] | null => {
  if (!additionalData || typeof additionalData !== 'object' || !('filePaths' in additionalData)) {
    return null;
  }

  const { filePaths } = additionalData;

  return Array.isArray(filePaths) &&
    filePaths.every((filePath) => typeof filePath === 'string' && path.isAbsolute(filePath))
    ? filePaths
    : null;
};

export const resolveSecondInstanceFilePaths = ({
  additionalData,
  argv,
  cwd,
  isFile = isRegularFile,
  isPackaged,
}: ResolveSecondInstanceFileOptions): readonly string[] => {
  const forwardedFilePaths = forwardedFilePathsFrom(additionalData);

  if (!forwardedFilePaths) {
    return resolveStartupFilePaths({ argv, cwd, isFile, isPackaged });
  }

  return resolveStartupFilePaths({
    argv: [argv[0] ?? 'sign', '--', ...forwardedFilePaths],
    cwd: path.parse(cwd).root,
    isFile,
    isPackaged: true,
  });
};

const errorResult = (filePath: string, message: string): FileOpenResult => ({
  filePath,
  kind: 'error',
  message,
});

export const loadFile = async (
  filePath: string,
  { maximumFileSize = MAXIMUM_FILE_SIZE }: LoadEditorStateOptions = {},
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
        documentId: randomUUID(),
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
