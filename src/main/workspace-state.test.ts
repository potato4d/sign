import { describe, expect, it } from 'vitest';

import type { EditorWorkspaceState, FileOpenResult, OpenedDocument } from '../shared/desktop-api';

import {
  EMPTY_WORKSPACE_STATE,
  activateWorkspaceDocument,
  addWorkspaceDocument,
  closeWorkspaceDocument,
  mergeFileResults,
  restoreWorkspaceDocument,
  updateSavedWorkspaceDocument,
} from './workspace-state';

const openedDocument = (filePath: string, documentId = `id:${filePath}`): OpenedDocument => ({
  contents: filePath,
  documentId,
  fileName: filePath.split('/').at(-1) ?? filePath,
  filePath,
});

const documentResult = (filePath: string): FileOpenResult => ({
  document: openedDocument(filePath),
  kind: 'document',
});

describe('workspace state', () => {
  it('adds unique documents in order and activates the newest', () => {
    const state = mergeFileResults(
      EMPTY_WORKSPACE_STATE,
      [documentResult('/one.ts'), documentResult('/two.ts'), documentResult('/one.ts')],
      { activateNewest: true, updateError: true },
    );

    expect(state.documents.map((document) => document.filePath)).toEqual(['/one.ts', '/two.ts']);
    expect(state.activeDocumentId).toBe('id:/one.ts');
  });

  it('activates only an open document', () => {
    const state = mergeFileResults(EMPTY_WORKSPACE_STATE, [documentResult('/one.ts')], {
      activateNewest: true,
      updateError: true,
    });

    expect(activateWorkspaceDocument(state, 'missing')).toBe(state);
    expect(activateWorkspaceDocument(state, 'id:/one.ts').activeDocumentId).toBe('id:/one.ts');
  });

  it('selects the neighboring tab when the active document closes', () => {
    const state: EditorWorkspaceState = {
      activeDocumentId: 'id:/two.ts',
      documents: [
        openedDocument('/one.ts'),
        openedDocument('/two.ts'),
        openedDocument('/three.ts'),
      ],
      error: null,
    };

    const afterMiddleClose = closeWorkspaceDocument(state, 'id:/two.ts');
    const afterLastClose = closeWorkspaceDocument(
      { ...afterMiddleClose, activeDocumentId: 'id:/three.ts' },
      'id:/three.ts',
    );

    expect(afterMiddleClose.activeDocumentId).toBe('id:/three.ts');
    expect(afterLastClose.activeDocumentId).toBe('id:/one.ts');
  });

  it('keeps the existing document identity when the same path is merged again', () => {
    const original = mergeFileResults(EMPTY_WORKSPACE_STATE, [documentResult('/one.ts')], {
      activateNewest: true,
      updateError: true,
    });
    const updated = mergeFileResults(
      original,
      [
        {
          document: {
            ...openedDocument('/one.ts', 'concurrent-id'),
            contents: 'updated',
          },
          kind: 'document',
        },
      ],
      { activateNewest: true, updateError: true },
    );

    expect(updated.documents).toEqual([
      {
        ...openedDocument('/one.ts'),
        contents: 'updated',
      },
    ]);
    expect(updated.activeDocumentId).toBe('id:/one.ts');
  });

  it('adds, saves, and restores untitled documents without changing their identity', () => {
    const document: OpenedDocument = {
      contents: '',
      documentId: 'untitled-id',
      fileName: 'Untitled-1',
      filePath: null,
    };
    const added = addWorkspaceDocument(EMPTY_WORKSPACE_STATE, document);
    const saved = updateSavedWorkspaceDocument(
      added,
      document.documentId,
      'saved text',
      '/notes/saved.ts',
    );
    const closed = closeWorkspaceDocument(saved, document.documentId);
    const restored = restoreWorkspaceDocument(closed, saved.documents[0] ?? document);

    expect(saved.documents[0]).toMatchObject({
      contents: 'saved text',
      documentId: 'untitled-id',
      fileName: 'saved.ts',
      filePath: '/notes/saved.ts',
    });
    expect(restored.activeDocumentId).toBe('untitled-id');
  });
});
