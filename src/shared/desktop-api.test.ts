import { describe, expect, it } from 'vitest';

import type { EditorWorkspaceState } from './desktop-api';

import { isDocumentSaveResult, isEditorCommand, isEditorWorkspaceState } from './desktop-api';

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
    expect(isEditorCommand('open-developer-tools')).toBe(false);
    expect(isEditorCommand({ command: 'save-document' })).toBe(false);
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
