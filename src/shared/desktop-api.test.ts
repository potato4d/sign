import { describe, expect, it } from 'vitest';

import type { EditorWorkspaceState } from './desktop-api';

import {
  isDocumentSaveResult,
  isDroppedFilePathList,
  isEditorCommand,
  isEditorWorkspaceState,
  isRecentFileList,
  MAXIMUM_RECENT_FILES,
  MAXIMUM_DROPPED_FILES,
} from './desktop-api';

const workspaceState: EditorWorkspaceState = {
  activeDocumentId: 'document-1',
  documents: [
    {
      contents: 'hello',
      documentId: 'document-1',
      fileName: 'hello.txt',
      filePath: '/notes/hello.txt',
    },
  ],
  error: null,
};

describe('desktop API validation', () => {
  it('accepts a consistent workspace and rejects duplicate identities and paths', () => {
    expect(isEditorWorkspaceState(workspaceState)).toBe(true);
    expect(
      isEditorWorkspaceState({
        ...workspaceState,
        documents: [...workspaceState.documents, workspaceState.documents[0]],
      }),
    ).toBe(false);
    expect(
      isEditorWorkspaceState({
        ...workspaceState,
        activeDocumentId: 'missing',
      }),
    ).toBe(false);
  });

  it('accepts only allowlisted editor commands', () => {
    expect(isEditorCommand('save-document')).toBe(true);
    expect(isEditorCommand('toggle-recent-files')).toBe(true);
    expect(isEditorCommand('open-developer-tools')).toBe(false);
    expect(isEditorCommand({ command: 'save-document' })).toBe(false);
  });

  it('accepts a bounded list of dropped file paths', () => {
    expect(isDroppedFilePathList(['/notes/one', '/notes/two.unknown'])).toBe(true);
    expect(isDroppedFilePathList(['/notes/one', ''])).toBe(false);
    expect(isDroppedFilePathList(['/notes/one', 2])).toBe(false);
    expect(
      isDroppedFilePathList(Array.from({ length: MAXIMUM_DROPPED_FILES + 1 }, () => '/x')),
    ).toBe(false);
  });

  it('accepts only bounded recent file lists with unique opaque ids', () => {
    const recentFile = {
      directoryPath: '/notes',
      fileName: 'one.txt',
      id: 'recent-1',
    };

    expect(isRecentFileList([recentFile])).toBe(true);
    expect(isRecentFileList([recentFile, recentFile])).toBe(false);
    expect(isRecentFileList([recentFile, { ...recentFile, id: 'recent-2' }])).toBe(false);
    expect(isRecentFileList([{ ...recentFile, fileName: '' }])).toBe(false);
    expect(
      isRecentFileList(
        Array.from({ length: MAXIMUM_RECENT_FILES + 1 }, (_, index) => ({
          ...recentFile,
          id: `recent-${index}`,
        })),
      ),
    ).toBe(false);
  });

  it('requires a saved document to remain present in the returned state', () => {
    expect(
      isDocumentSaveResult({
        documentId: 'document-1',
        kind: 'saved',
        state: workspaceState,
      }),
    ).toBe(true);
    expect(
      isDocumentSaveResult({
        documentId: 'missing',
        kind: 'saved',
        state: workspaceState,
      }),
    ).toBe(false);
  });
});
