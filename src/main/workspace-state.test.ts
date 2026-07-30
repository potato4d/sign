import { describe, expect, it } from 'vitest';

import type { EditorWorkspaceState, FileOpenResult, OpenedDocument } from '../shared/desktop-api';

import {
  EMPTY_WORKSPACE_STATE,
  activateWorkspaceDocument,
  closeWorkspaceDocument,
  mergeFileResults,
} from './workspace-state';

const openedDocument = (filePath: string): OpenedDocument => ({
  contents: filePath,
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
    expect(state.activeFilePath).toBe('/one.ts');
  });

  it('activates only an open document', () => {
    const state = mergeFileResults(EMPTY_WORKSPACE_STATE, [documentResult('/one.ts')], {
      activateNewest: true,
      updateError: true,
    });

    expect(activateWorkspaceDocument(state, '/missing.ts')).toBe(state);
    expect(activateWorkspaceDocument(state, '/one.ts').activeFilePath).toBe('/one.ts');
  });

  it('selects the neighboring tab when the active document closes', () => {
    const state: EditorWorkspaceState = {
      activeFilePath: '/two.ts',
      documents: [
        openedDocument('/one.ts'),
        openedDocument('/two.ts'),
        openedDocument('/three.ts'),
      ],
      error: null,
    };

    const afterMiddleClose = closeWorkspaceDocument(state, '/two.ts');
    const afterLastClose = closeWorkspaceDocument(
      { ...afterMiddleClose, activeFilePath: '/three.ts' },
      '/three.ts',
    );

    expect(afterMiddleClose.activeFilePath).toBe('/three.ts');
    expect(afterLastClose.activeFilePath).toBe('/one.ts');
  });
});
