export const IPC_CHANNELS = {
  activateDocument: 'workspace:activate-document',
  closeDocument: 'workspace:close-document',
  confirmClose: 'workspace:confirm-close',
  createDocument: 'workspace:create-document',
  editorCommand: 'editor:command',
  getRecentFiles: 'recent-files:get',
  getWorkspaceState: 'workspace:get-state',
  openDroppedFiles: 'workspace:open-dropped-files',
  openFiles: 'workspace:open-files',
  openRecentFile: 'recent-files:open',
  quitApplicationIfEmpty: 'application:quit-if-empty',
  reopenClosedDocument: 'workspace:reopen-closed-document',
  saveDocument: 'workspace:save-document',
  saveDocumentAs: 'workspace:save-document-as',
  recentFilesChanged: 'recent-files:changed',
  workspaceStateChanged: 'workspace:state-changed',
} as const;

export const EDITOR_COMMANDS = [
  'close-active-document',
  'command-palette',
  'create-document',
  'next-document',
  'open-files',
  'previous-document',
  'quick-switcher',
  'redo',
  'reopen-closed-document',
  'save-document',
  'save-document-as',
  'select-document-1',
  'select-document-2',
  'select-document-3',
  'select-document-4',
  'select-document-5',
  'select-document-6',
  'select-document-7',
  'select-document-8',
  'select-document-9',
  'toggle-recent-files',
  'toggle-word-wrap',
  'undo',
] as const;

export type EditorCommand = (typeof EDITOR_COMMANDS)[number];

export interface OpenedDocument {
  readonly contents: string;
  readonly documentId: string;
  readonly fileName: string;
  readonly filePath: string | null;
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
  readonly activeDocumentId: string | null;
  readonly documents: readonly OpenedDocument[];
  readonly error: {
    readonly filePath: string;
    readonly message: string;
  } | null;
}

export type CloseDecision = 'cancel' | 'discard' | 'save';
export type DesktopPlatform = 'darwin' | 'linux' | 'win32';

export const MAXIMUM_DROPPED_FILES = 256;
export const MAXIMUM_RECENT_FILES = 20;

export interface RecentFile {
  readonly directoryPath: string;
  readonly fileName: string;
  readonly id: string;
}

export type DocumentSaveResult =
  | {
      readonly documentId: string;
      readonly kind: 'saved';
      readonly state: EditorWorkspaceState;
    }
  | {
      readonly kind: 'cancelled';
      readonly state: EditorWorkspaceState;
    }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly state: EditorWorkspaceState;
    };

export interface DesktopApi {
  activateDocument(documentId: string): Promise<EditorWorkspaceState>;
  closeDocument(documentId: string): Promise<EditorWorkspaceState>;
  confirmClose(documentId: string): Promise<CloseDecision>;
  createDocument(): Promise<EditorWorkspaceState>;
  getRecentFiles(): Promise<readonly RecentFile[]>;
  getWorkspaceState(): Promise<EditorWorkspaceState>;
  onEditorCommand(listener: (command: EditorCommand) => void): () => void;
  onRecentFilesChanged(listener: (recentFiles: readonly RecentFile[]) => void): () => void;
  onWorkspaceStateChanged(listener: (state: EditorWorkspaceState) => void): () => void;
  openDroppedFiles(files: readonly unknown[]): Promise<EditorWorkspaceState>;
  openFiles(): Promise<EditorWorkspaceState>;
  openRecentFile(recentFileId: string): Promise<EditorWorkspaceState>;
  readonly platform: DesktopPlatform;
  quitApplicationIfEmpty(): Promise<boolean>;
  reopenClosedDocument(): Promise<EditorWorkspaceState>;
  saveDocument(documentId: string, contents: string): Promise<DocumentSaveResult>;
  saveDocumentAs(documentId: string, contents: string): Promise<DocumentSaveResult>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isDroppedFilePathList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.length <= MAXIMUM_DROPPED_FILES &&
  value.every(
    (filePath) => typeof filePath === 'string' && filePath.length > 0 && !filePath.includes('\0'),
  );

const isRecentFile = (value: unknown): value is RecentFile =>
  isRecord(value) &&
  typeof value['directoryPath'] === 'string' &&
  value['directoryPath'].length > 0 &&
  !value['directoryPath'].includes('\0') &&
  typeof value['fileName'] === 'string' &&
  value['fileName'].length > 0 &&
  !value['fileName'].includes('\0') &&
  typeof value['id'] === 'string' &&
  value['id'].length > 0 &&
  !value['id'].includes('\0');

export const isRecentFileList = (value: unknown): value is readonly RecentFile[] => {
  if (!Array.isArray(value) || value.length > MAXIMUM_RECENT_FILES || !value.every(isRecentFile)) {
    return false;
  }

  const ids = new Set(value.map((recentFile) => recentFile.id));
  const displayPaths = new Set(
    value.map((recentFile) => `${recentFile.directoryPath}\0${recentFile.fileName}`),
  );

  return ids.size === value.length && displayPaths.size === value.length;
};

const isOpenedDocument = (value: unknown): value is OpenedDocument => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['contents'] === 'string' &&
    typeof value['documentId'] === 'string' &&
    typeof value['fileName'] === 'string' &&
    (value['filePath'] === null || typeof value['filePath'] === 'string')
  );
};

export const isEditorWorkspaceState = (value: unknown): value is EditorWorkspaceState => {
  if (
    !isRecord(value) ||
    (value['activeDocumentId'] !== null && typeof value['activeDocumentId'] !== 'string') ||
    !Array.isArray(value['documents'])
  ) {
    return false;
  }

  const documents = value['documents'];

  if (!documents.every(isOpenedDocument)) {
    return false;
  }

  const documentIds = new Set(documents.map((document) => document.documentId));
  const filePaths = documents
    .map((document) => document.filePath)
    .filter((filePath): filePath is string => filePath !== null);

  if (documentIds.size !== documents.length || new Set(filePaths).size !== filePaths.length) {
    return false;
  }

  if (
    value['activeDocumentId'] !== null &&
    !documents.some((document) => document.documentId === value['activeDocumentId'])
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

export const isCloseDecision = (value: unknown): value is CloseDecision =>
  value === 'cancel' || value === 'discard' || value === 'save';

export const isEditorCommand = (value: unknown): value is EditorCommand =>
  typeof value === 'string' && (EDITOR_COMMANDS as readonly string[]).includes(value);

export const isDocumentSaveResult = (value: unknown): value is DocumentSaveResult => {
  if (!isRecord(value) || !isEditorWorkspaceState(value['state'])) {
    return false;
  }

  if (value['kind'] === 'cancelled') {
    return true;
  }

  if (value['kind'] === 'error') {
    return typeof value['message'] === 'string';
  }

  return (
    value['kind'] === 'saved' &&
    typeof value['documentId'] === 'string' &&
    value['state'].documents.some((document) => document.documentId === value['documentId'])
  );
};
