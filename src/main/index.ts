import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

import { app, BrowserWindow, dialog, session } from 'electron';

import type {
  CloseDecision,
  DocumentSaveResult,
  EditorWorkspaceState,
  OpenedDocument,
  RecentFile,
} from '../shared/desktop-api';
import type { AppIpcHandlers } from './ipc';
import type { RecentFileRecord } from './recent-files';

import { IPC_CHANNELS } from '../shared/desktop-api';
import { installApplicationMenu } from './application-menu';
import { CLI_LINK_PATH, CliLauncherInstallError, installCliLauncher } from './cli-launcher';
import { createMainWindow } from './create-main-window';
import { writeDocumentFile } from './document-file';
import {
  findRecentFileById,
  loadRecentFiles,
  saveRecentFiles,
  toRecentFileView,
  touchRecentFile,
} from './recent-files';
import {
  registerApplicationProtocol,
  registerApplicationScheme,
} from './register-application-protocol';
import { configureSessionSecurity } from './security';
import { secondInstanceActionFor } from './second-instance';
import { loadFile, resolveSecondInstanceFilePaths, resolveStartupFilePaths } from './startup-file';
import {
  EMPTY_WORKSPACE_STATE,
  activateWorkspaceDocument,
  addWorkspaceDocument,
  canQuitApplication,
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
const RECENT_FILES_STORAGE_NAME = 'recent-files.json';
let recentFileRecords: readonly RecentFileRecord[] = [];
let recentFilesInitialization: Promise<void> | null = null;
let recentFilesWriteQueue: Promise<void> = Promise.resolve();
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

const recentFilesStoragePath = (): string =>
  join(app.getPath('userData'), RECENT_FILES_STORAGE_NAME);

const recentFilesForRenderer = (): readonly RecentFile[] => recentFileRecords.map(toRecentFileView);

const initializeRecentFiles = (): Promise<void> => {
  recentFilesInitialization ??= loadRecentFiles(recentFilesStoragePath())
    .then((records) => {
      recentFileRecords = records;
    })
    .catch((error: unknown) => {
      console.error('Failed to load the recent file list.', error);
      recentFileRecords = [];
    });

  return recentFilesInitialization;
};

const publishRecentFiles = (): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.recentFilesChanged, recentFilesForRenderer());
};

const persistRecentFiles = async (records: readonly RecentFileRecord[]): Promise<void> => {
  const write = recentFilesWriteQueue.then(() =>
    saveRecentFiles(recentFilesStoragePath(), records),
  );
  recentFilesWriteQueue = write.catch(() => undefined);

  try {
    await write;
  } catch (error: unknown) {
    console.error('Failed to persist the recent file list.', error);
  }
};

const recordRecentEdit = async (filePath: string): Promise<void> => {
  recentFileRecords = touchRecentFile(recentFileRecords, filePath);
  publishRecentFiles();
  await persistRecentFiles(recentFileRecords);
};

const focusMainWindow = (): void => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
};

const publishWorkspaceState = (
  state: EditorWorkspaceState,
  notifyRenderer = false,
): EditorWorkspaceState => {
  workspaceState = state;

  if (!mainWindow || mainWindow.isDestroyed()) {
    return workspaceState;
  }

  const document = activeDocument();

  mainWindow.setTitle(document ? `${document.fileName} — sign` : 'sign');
  if (notifyRenderer) {
    mainWindow.webContents.send(IPC_CHANNELS.workspaceStateChanged, workspaceState);
  }

  return workspaceState;
};

const openFilePaths = async (
  filePaths: readonly string[],
  notifyRenderer = false,
): Promise<EditorWorkspaceState> => {
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
    notifyRenderer,
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

  const state = publishWorkspaceState(
    updateSavedWorkspaceDocument(workspaceState, documentId, contents, filePath),
  );
  await recordRecentEdit(filePath);

  return {
    documentId,
    kind: 'saved',
    state,
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

const quitApplicationIfEmpty = (): boolean => {
  if (!canQuitApplication(workspaceState)) {
    return false;
  }

  setImmediate(() => {
    app.quit();
  });
  return true;
};

const showApplicationMessage = async (options: Electron.MessageBoxOptions): Promise<void> => {
  if (mainWindow) {
    await dialog.showMessageBox(mainWindow, options);
  } else {
    await dialog.showMessageBox(options);
  }
};

const installCommandLineLauncher = async (): Promise<void> => {
  try {
    const result = await installCliLauncher();
    const alreadyInstalled = result === 'already-installed';

    await showApplicationMessage({
      detail: `Open a new terminal and run sign <file>. The command is available at ${CLI_LINK_PATH}.`,
      message: alreadyInstalled
        ? "The 'sign' command is already installed."
        : "The 'sign' command was installed.",
      type: 'info',
    });
  } catch (error: unknown) {
    await showApplicationMessage({
      detail:
        error instanceof CliLauncherInstallError
          ? error.message
          : 'An unexpected error prevented the command from being installed.',
      message: "The 'sign' command was not installed.",
      type: 'error',
    });
  }
};

const ipcHandlers: AppIpcHandlers = {
  activateDocument: (documentId) =>
    publishWorkspaceState(activateWorkspaceDocument(workspaceState, documentId)),
  closeDocument,
  confirmClose,
  createDocument,
  getRecentFiles: recentFilesForRenderer,
  getWorkspaceState: () => workspaceState,
  openDroppedFiles: (filePaths) => openFilePaths(filePaths),
  openFiles: openFilesWithDialog,
  openRecentFile: (recentFileId) => {
    const recentFile = findRecentFileById(recentFileRecords, recentFileId);

    if (!recentFile) {
      throw new Error('Rejected an unknown recent file identifier.');
    }

    return openFilePaths([recentFile.filePath]);
  },
  quitApplicationIfEmpty,
  reopenClosedDocument,
  saveDocument,
  saveDocumentAs,
};

const openMainWindow = async (): Promise<void> => {
  if (mainWindow) {
    focusMainWindow();
    return;
  }

  await initializeRecentFiles();

  const initialFilePaths = pendingFilePaths;
  pendingFilePaths = [];

  mainWindow = createMainWindow(ipcHandlers);
  mainWindow.once('closed', () => {
    mainWindow = null;
  });

  await openFilePaths(initialFilePaths, true);

  if (pendingFilePaths.length > 0) {
    const laterFilePaths = pendingFilePaths;
    pendingFilePaths = [];
    await openFilePaths(laterFilePaths, true);
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

  void openFilePaths([filePath], true).then(focusMainWindow);
});

app.on('web-contents-created', (_event, webContents) => {
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

const hasSingleInstanceLock = app.requestSingleInstanceLock({
  filePaths: pendingFilePaths,
});

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory, additionalData) => {
    const filePaths = resolveSecondInstanceFilePaths({
      additionalData,
      argv,
      cwd: workingDirectory,
      isPackaged: app.isPackaged,
    });
    const action = secondInstanceActionFor(filePaths, mainWindow !== null);

    if (action.kind === 'focus-window') {
      focusMainWindow();
      return;
    }

    if (action.kind === 'ensure-window') {
      enqueuePendingFilePaths(action.filePaths);
      void ensureMainWindow().then(focusMainWindow);
      return;
    }

    void openFilePaths(action.filePaths, true).then(focusMainWindow);
  });

  void app.whenReady().then(async () => {
    configureSessionSecurity(session.defaultSession);
    registerApplicationProtocol(join(__dirname, '../renderer'));
    installApplicationMenu(() => mainWindow, {
      installCliLauncher: () => void installCommandLineLauncher(),
    });
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
