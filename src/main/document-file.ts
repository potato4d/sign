import { writeFile } from 'node:fs/promises';

import { MAXIMUM_FILE_SIZE } from './file-policy';

export type DocumentWriteResult =
  | {
      readonly kind: 'saved';
    }
  | {
      readonly kind: 'error';
      readonly message: string;
    };

export const writeDocumentFile = async (
  filePath: string,
  contents: string,
  maximumFileSize = MAXIMUM_FILE_SIZE,
): Promise<DocumentWriteResult> => {
  if (Buffer.byteLength(contents, 'utf8') > maximumFileSize) {
    return {
      kind: 'error',
      message: 'The document is too large to save safely.',
    };
  }

  try {
    await writeFile(filePath, contents, 'utf8');
    return {
      kind: 'saved',
    };
  } catch {
    return {
      kind: 'error',
      message: 'The document could not be saved.',
    };
  }
};
