import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

import { app, BrowserWindow, dialog, session } from 'electron';

import type {
  CloseDecision,
  DocumentSaveResult,
  EditorWorkspaceState,
  OpenedDocument,
} from '../shared/desktop-api';
import type { AppIpcHandlers } from './ipc';

import { IPC_CHANNELS } from '../shared/desktop-api';
import { installApplicationMenu } from './application-menu';
import { createMainWindow } from './create-main-window';
import { writeDocumentFile } from './document-file';
import {
  registerApplicationProtocol,
  registerApplicationScheme,
} from './register-application-protocol';
import { configureSessionSecurity } from './security';
import { loadFile, resolveStartupFilePaths } from './startup-file';
import {
  EMPTY_WORKSPACE_STATE,
  activateWorkspaceDocument,
  addWorkspaceDocument,
  closeWorkspaceDocument,
  mergeFileResults,
  restoreWorkspaceDocument,
  updateSavedWorkspaceDocument,
} from './workspace-state';

registerApplicationScheme();
app.enableSandbox();

let workspaceState: EditorWorkspaceState = EMPTY_WORKSPACE_STATE;
let mainWindow: BrowserWindow | null = null;
let openingMainWindow: Promise<void> | null = null;
let latestOpenRequestId = 0;
let untitledDocumentNumber = 0;
const closedDocuments: (
  | {
      readonly document: OpenedDocument;
      readonly kind: 'untitled';
    }
  | {
      readonly filePath: string;
      readonly kind: 'file';
    }
)[] = [];
let pendingFilePaths = [
  ...resolveStartupFilePaths({
    argv: process.argv,
    cwd: process.cwd(),
    isPackaged: app.isPackaged,
  }),
];

const enqueuePendingFilePaths = (filePaths: readonly string[]): void => {
  const pending = new Set(pendingFilePaths);

  for (const filePath of filePaths) {
    if (!pending.has(filePath)) {
      pending.add(filePath);
      pendingFilePaths.push(filePath);
    }
  }
};

const activeDocument = (): EditorWorkspaceState['documents'][number] | undefined =>
  workspaceState.documents.find(
    (document) => document.documentId === workspaceState.activeDocumentId,
  );

const focusMainWindow = (): void => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
};

const publishWorkspaceState = (state: EditorWorkspaceState): EditorWorkspaceState => {
  workspaceState = state;

  if (!mainWindow || mainWindow.isDestroyed()) {
    return workspaceState;
  }

  const document = activeDocument();

  mainWindow.setTitle(document ? `${document.fileName} — Winzig` : 'Winzig');
  mainWindow.webContents.send(IPC_CHANNELS.workspaceStateChanged, workspaceState);

  return workspaceState;
};

const openFilePaths = async (filePaths: readonly string[]): Promise<EditorWorkspaceState> => {
  const uniqueFilePaths = [...new Set(filePaths.map((filePath) => resolve(filePath)))];

  if (uniqueFilePaths.length === 0) {
    return workspaceState;
  }

  const requestId = ++latestOpenRequestId;
  const results = await Promise.all(
    uniqueFilePaths.map((filePath) => {
      const existingDocument = workspaceState.documents.find(
        (document) => document.filePath === filePath,
      );

      return existingDocument
        ? Promise.resolve({ document: existingDocument, kind: 'document' } as const)
        : loadFile(filePath);
    }),
  );
  const isLatestRequest = requestId === latestOpenRequestId;

  return publishWorkspaceState(
    mergeFileResults(workspaceState, results, {
      activateNewest: isLatestRequest,
      updateError: isLatestRequest,
    }),
  );
};

const openFilesWithDialog = async (): Promise<EditorWorkspaceState> => {
  if (!mainWindow) {
    return workspaceState;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Open Files',
  });

  return result.canceled ? workspaceState : openFilePaths(result.filePaths);
};

const createDocument = (): EditorWorkspaceState => {
  untitledDocumentNumber += 1;

  return publishWorkspaceState(
    addWorkspaceDocument(workspaceState, {
      contents: '',
      documentId: randomUUID(),
      fileName: `Untitled-${untitledDocumentNumber}`,
      filePath: null,
    }),
  );
};

const closeDocument = (documentId: string): EditorWorkspaceState => {
  const document = workspaceState.documents.find(
    (candidate) => candidate.documentId === documentId,
  );
  const nextState = closeWorkspaceDocument(workspaceState, documentId);

  if (document && nextState !== workspaceState) {
    closedDocuments.push(
      document.filePath
        ? {
            filePath: document.filePath,
            kind: 'file',
          }
        : {
            document,
            kind: 'untitled',
          },
    );

    if (closedDocuments.length > 20) {
      closedDocuments.shift();
    }
  }

  return publishWorkspaceState(nextState);
};

const reopenClosedDocument = async (): Promise<EditorWorkspaceState> => {
  const closedDocument = closedDocuments.pop();

  if (!closedDocument) {
    return workspaceState;
  }

  if (closedDocument.kind === 'file') {
    return openFilePaths([closedDocument.filePath]);
  }

  return publishWorkspaceState(restoreWorkspaceDocument(workspaceState, closedDocument.document));
};

const saveDocumentToPath = async (
  documentId: string,
  contents: string,
  filePath: string,
): Promise<DocumentSaveResult> => {
  const document = workspaceState.documents.find(
    (candidate) => candidate.documentId === documentId,
  );

  if (!document) {
    return {
      kind: 'error',
      message: 'The document is no longer open.',
      state: workspaceState,
    };
  }

  const conflictingDocument = workspaceState.documents.find(
    (candidate) =>
      candidate.documentId !== documentId &&
      candidate.filePath !== null &&
      candidate.filePath === filePath,
  );

  if (conflictingDocument) {
    return {
      kind: 'error',
      message: 'That file is already open in another tab.',
      state: workspaceState,
    };
  }

  const writeResult = await writeDocumentFile(filePath, contents);

  if (writeResult.kind === 'error') {
    return {
      kind: 'error',
      message: writeResult.message,
      state: workspaceState,
    };
  }

  return {
    documentId,
    kind: 'saved',
    state: publishWorkspaceState(
      updateSavedWorkspaceDocument(workspaceState, documentId, contents, filePath),
    ),
  };
};

const saveDocumentAs = async (
  documentId: string,
  contents: string,
): Promise<DocumentSaveResult> => {
  const document = workspaceState.documents.find(
    (candidate) => candidate.documentId === documentId,
  );

  if (!document || !mainWindow) {
    return {
      kind: 'error',
      message: 'The document is no longer available.',
      state: workspaceState,
    };
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: document.filePath ?? document.fileName,
    title: 'Save File',
  });

  if (result.canceled || !result.filePath) {
    return {
      kind: 'cancelled',
      state: workspaceState,
    };
  }

  return saveDocumentToPath(documentId, contents, resolve(result.filePath));
};

const saveDocument = async (documentId: string, contents: string): Promise<DocumentSaveResult> => {
  const document = workspaceState.documents.find(
    (candidate) => candidate.documentId === documentId,
  );

  if (!document) {
    return {
      kind: 'error',
      message: 'The document is no longer open.',
      state: workspaceState,
    };
  }

  return document.filePath
    ? saveDocumentToPath(documentId, contents, document.filePath)
    : saveDocumentAs(documentId, contents);
};

const confirmClose = async (documentId: string): Promise<CloseDecision> => {
  if (!mainWindow) {
    return 'cancel';
  }

  const document = workspaceState.documents.find(
    (candidate) => candidate.documentId === documentId,
  );

  if (!document) {
    return 'cancel';
  }

  const { response } = await dialog.showMessageBox(mainWindow, {
    buttons: ['Save', "Don't Save", 'Cancel'],
    cancelId: 2,
    defaultId: 0,
    detail: 'Your changes will be lost if you do not save them.',
    message: `Do you want to save the changes to ${document.fileName}?`,
    noLink: true,
    title: 'Unsaved Changes',
    type: 'warning',
  });

  return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel';
};

const ipcHandlers: AppIpcHandlers = {
  activateDocument: (documentId) =>
    publishWorkspaceState(activateWorkspaceDocument(workspaceState, documentId)),
  closeDocument,
  confirmClose,
  createDocument,
  getWorkspaceState: () => workspaceState,
  openFiles: openFilesWithDialog,
  reopenClosedDocument,
  saveDocument,
  saveDocumentAs,
};

const openMainWindow = async (): Promise<void> => {
  if (mainWindow) {
    focusMainWindow();
    return;
  }

  const initialFilePaths = pendingFilePaths;
  pendingFilePaths = [];

  await openFilePaths(initialFilePaths);

  mainWindow = createMainWindow(ipcHandlers);
  mainWindow.once('closed', () => {
    mainWindow = null;
  });

  if (pendingFilePaths.length > 0) {
    const laterFilePaths = pendingFilePaths;
    pendingFilePaths = [];
    await openFilePaths(laterFilePaths);
  }
};

const ensureMainWindow = (): Promise<void> => {
  openingMainWindow ??= openMainWindow().finally(() => {
    openingMainWindow = null;
  });

  return openingMainWindow;
};

app.on('open-file', (event, filePath) => {
  event.preventDefault();

  if (!app.isReady() || !mainWindow) {
    enqueuePendingFilePaths([filePath]);

    if (app.isReady()) {
      void ensureMainWindow();
    }

    return;
  }

  void openFilePaths([filePath]).then(focusMainWindow);
});

app.on('web-contents-created', (_event, webContents) => {
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const filePaths = resolveStartupFilePaths({
      argv,
      cwd: workingDirectory,
      isPackaged: app.isPackaged,
    });

    if (filePaths.length === 0) {
      focusMainWindow();
      return;
    }

    if (!mainWindow) {
      enqueuePendingFilePaths(filePaths);
      void ensureMainWindow();
      return;
    }

    void openFilePaths(filePaths).then(focusMainWindow);
  });

  void app.whenReady().then(async () => {
    configureSessionSecurity(session.defaultSession);
    registerApplicationProtocol(join(__dirname, '../renderer'));
    installApplicationMenu(() => mainWindow);
    await ensureMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void ensureMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
