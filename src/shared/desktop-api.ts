export const IPC_CHANNELS = {
  activateDocument: 'workspace:activate-document',
  closeDocument: 'workspace:close-document',
  getWorkspaceState: 'workspace:get-state',
  openFiles: 'workspace:open-files',
  workspaceStateChanged: 'workspace:state-changed',
} as const;

export interface OpenedDocument {
  readonly contents: string;
  readonly fileName: string;
  readonly filePath: string;
}

export type FileOpenResult =
  | {
      readonly document: OpenedDocument;
      readonly kind: 'document';
    }
  | {
      readonly filePath: string;
      readonly kind: 'error';
      readonly message: string;
    };

export interface EditorWorkspaceState {
  readonly activeFilePath: string | null;
  readonly documents: readonly OpenedDocument[];
  readonly error: {
    readonly filePath: string;
    readonly message: string;
  } | null;
}

export interface DesktopApi {
  activateDocument(filePath: string): Promise<EditorWorkspaceState>;
  closeDocument(filePath: string): Promise<EditorWorkspaceState>;
  getWorkspaceState(): Promise<EditorWorkspaceState>;
  onWorkspaceStateChanged(listener: (state: EditorWorkspaceState) => void): () => void;
  openFiles(): Promise<EditorWorkspaceState>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isOpenedDocument = (value: unknown): value is OpenedDocument => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['contents'] === 'string' &&
    typeof value['fileName'] === 'string' &&
    typeof value['filePath'] === 'string'
  );
};

export const isEditorWorkspaceState = (value: unknown): value is EditorWorkspaceState => {
  if (
    !isRecord(value) ||
    (value['activeFilePath'] !== null && typeof value['activeFilePath'] !== 'string') ||
    !Array.isArray(value['documents'])
  ) {
    return false;
  }

  const documents = value['documents'];

  if (!documents.every(isOpenedDocument)) {
    return false;
  }

  if (
    value['activeFilePath'] !== null &&
    !documents.some((document) => document.filePath === value['activeFilePath'])
  ) {
    return false;
  }

  const error = value['error'];

  return (
    error === null ||
    (isRecord(error) &&
      typeof error['filePath'] === 'string' &&
      typeof error['message'] === 'string')
  );
};
