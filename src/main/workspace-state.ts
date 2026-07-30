import type { EditorWorkspaceState, FileOpenResult, OpenedDocument } from '../shared/desktop-api';

export const EMPTY_WORKSPACE_STATE: EditorWorkspaceState = {
  activeDocumentId: null,
  documents: [],
  error: null,
};

export const canQuitApplication = (state: EditorWorkspaceState): boolean =>
  state.documents.length === 0;

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
  let latestSuccessfulDocumentId: string | null = null;
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

    const existingIndex = documents.findIndex((document) => {
      if (result.document.filePath) {
        return document.filePath === result.document.filePath;
      }

      return document.documentId === result.document.documentId;
    });

    if (existingIndex === -1) {
      documents.push(result.document);
      latestSuccessfulDocumentId = result.document.documentId;
    } else {
      const existingDocument = documents[existingIndex];

      if (!existingDocument) {
        continue;
      }

      documents[existingIndex] = {
        ...result.document,
        documentId: existingDocument.documentId,
      };
      latestSuccessfulDocumentId = existingDocument.documentId;
    }

    if (updateError) {
      latestError = null;
    }
  }

  const shouldActivate =
    latestSuccessfulDocumentId && (activateNewest || state.activeDocumentId === null);

  return {
    activeDocumentId: shouldActivate ? latestSuccessfulDocumentId : state.activeDocumentId,
    documents,
    error: latestError,
  };
};

export const activateWorkspaceDocument = (
  state: EditorWorkspaceState,
  documentId: string,
): EditorWorkspaceState => {
  if (!state.documents.some((document) => document.documentId === documentId)) {
    return state;
  }

  return {
    ...state,
    activeDocumentId: documentId,
  };
};

export const closeWorkspaceDocument = (
  state: EditorWorkspaceState,
  documentId: string,
): EditorWorkspaceState => {
  const closingIndex = state.documents.findIndex((document) => document.documentId === documentId);

  if (closingIndex === -1) {
    return state;
  }

  const closingDocument = state.documents[closingIndex];
  const documents = state.documents.filter((document) => document.documentId !== documentId);
  let activeDocumentId = state.activeDocumentId;

  if (activeDocumentId === documentId) {
    activeDocumentId =
      documents[closingIndex]?.documentId ?? documents[closingIndex - 1]?.documentId ?? null;
  }

  return {
    activeDocumentId,
    documents,
    error:
      closingDocument?.filePath && state.error?.filePath === closingDocument.filePath
        ? null
        : state.error,
  };
};

export const addWorkspaceDocument = (
  state: EditorWorkspaceState,
  document: OpenedDocument,
): EditorWorkspaceState => ({
  activeDocumentId: document.documentId,
  documents: [...state.documents, document],
  error: null,
});

export const restoreWorkspaceDocument = (
  state: EditorWorkspaceState,
  document: OpenedDocument,
): EditorWorkspaceState => {
  const existingDocument = document.filePath
    ? state.documents.find((candidate) => candidate.filePath === document.filePath)
    : undefined;

  if (existingDocument) {
    return activateWorkspaceDocument(state, existingDocument.documentId);
  }

  if (state.documents.some((candidate) => candidate.documentId === document.documentId)) {
    return activateWorkspaceDocument(state, document.documentId);
  }

  return addWorkspaceDocument(state, document);
};

export const updateSavedWorkspaceDocument = (
  state: EditorWorkspaceState,
  documentId: string,
  contents: string,
  filePath?: string,
): EditorWorkspaceState => {
  const documentIndex = state.documents.findIndex((document) => document.documentId === documentId);
  const document = state.documents[documentIndex];

  if (!document) {
    return state;
  }

  const documents = [...state.documents];
  documents[documentIndex] = {
    ...document,
    contents,
    fileName: filePath ? filePath.split(/[\\/]/).at(-1) || filePath : document.fileName,
    filePath: filePath ?? document.filePath,
  };

  return {
    ...state,
    documents,
    error: null,
  };
};
