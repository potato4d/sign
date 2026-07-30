import type { EditorWorkspaceState, FileOpenResult } from '../shared/desktop-api';

export const EMPTY_WORKSPACE_STATE: EditorWorkspaceState = {
  activeFilePath: null,
  documents: [],
  error: null,
};

interface MergeFileResultsOptions {
  readonly activateNewest: boolean;
  readonly updateError: boolean;
}

export const mergeFileResults = (
  state: EditorWorkspaceState,
  results: readonly FileOpenResult[],
  { activateNewest, updateError }: MergeFileResultsOptions,
): EditorWorkspaceState => {
  const documents = [...state.documents];
  let latestSuccessfulPath: string | null = null;
  let latestError = state.error;

  for (const result of results) {
    if (result.kind === 'error') {
      if (updateError) {
        latestError = {
          filePath: result.filePath,
          message: result.message,
        };
      }

      continue;
    }

    const existingIndex = documents.findIndex(
      (document) => document.filePath === result.document.filePath,
    );

    if (existingIndex === -1) {
      documents.push(result.document);
    } else {
      documents[existingIndex] = result.document;
    }

    latestSuccessfulPath = result.document.filePath;

    if (updateError) {
      latestError = null;
    }
  }

  const shouldActivate = latestSuccessfulPath && (activateNewest || state.activeFilePath === null);

  return {
    activeFilePath: shouldActivate ? latestSuccessfulPath : state.activeFilePath,
    documents,
    error: latestError,
  };
};

export const activateWorkspaceDocument = (
  state: EditorWorkspaceState,
  filePath: string,
): EditorWorkspaceState => {
  if (!state.documents.some((document) => document.filePath === filePath)) {
    return state;
  }

  return {
    ...state,
    activeFilePath: filePath,
  };
};

export const closeWorkspaceDocument = (
  state: EditorWorkspaceState,
  filePath: string,
): EditorWorkspaceState => {
  const closingIndex = state.documents.findIndex((document) => document.filePath === filePath);

  if (closingIndex === -1) {
    return state;
  }

  const documents = state.documents.filter((document) => document.filePath !== filePath);
  let activeFilePath = state.activeFilePath;

  if (activeFilePath === filePath) {
    activeFilePath =
      documents[closingIndex]?.filePath ?? documents[closingIndex - 1]?.filePath ?? null;
  }

  return {
    activeFilePath,
    documents,
    error: state.error?.filePath === filePath ? null : state.error,
  };
};
