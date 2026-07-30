import { join } from 'node:path';

import { app, BrowserWindow, dialog, session } from 'electron';

import type { EditorWorkspaceState } from '../shared/desktop-api';
import type { AppIpcHandlers } from './ipc';

import { IPC_CHANNELS } from '../shared/desktop-api';
import { createMainWindow } from './create-main-window';
import {
  registerApplicationProtocol,
  registerApplicationScheme,
} from './register-application-protocol';
import { configureSessionSecurity } from './security';
import { loadFile, resolveStartupFilePaths } from './startup-file';
import {
  EMPTY_WORKSPACE_STATE,
  activateWorkspaceDocument,
  closeWorkspaceDocument,
  mergeFileResults,
} from './workspace-state';

registerApplicationScheme();
app.enableSandbox();

let workspaceState: EditorWorkspaceState = EMPTY_WORKSPACE_STATE;
let mainWindow: BrowserWindow | null = null;
let openingMainWindow: Promise<void> | null = null;
let latestOpenRequestId = 0;
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
  workspaceState.documents.find((document) => document.filePath === workspaceState.activeFilePath);

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
  const uniqueFilePaths = [...new Set(filePaths)];

  if (uniqueFilePaths.length === 0) {
    return workspaceState;
  }

  const requestId = ++latestOpenRequestId;
  const results = await Promise.all(uniqueFilePaths.map((filePath) => loadFile(filePath)));
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

const ipcHandlers: AppIpcHandlers = {
  activateDocument: (filePath) =>
    publishWorkspaceState(activateWorkspaceDocument(workspaceState, filePath)),
  closeDocument: (filePath) =>
    publishWorkspaceState(closeWorkspaceDocument(workspaceState, filePath)),
  getWorkspaceState: () => workspaceState,
  openFiles: openFilesWithDialog,
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
