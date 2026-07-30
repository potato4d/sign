import { join } from 'node:path';

import { app, BrowserWindow, session } from 'electron';

import type { EditorState } from '../shared/desktop-api';

import { IPC_CHANNELS } from '../shared/desktop-api';
import { createMainWindow } from './create-main-window';
import {
  registerApplicationProtocol,
  registerApplicationScheme,
} from './register-application-protocol';
import { configureSessionSecurity } from './security';
import { loadEditorState, resolveStartupFilePath } from './startup-file';

registerApplicationScheme();
app.enableSandbox();

let editorState: EditorState = { kind: 'empty' };
let mainWindow: BrowserWindow | null = null;
let openingMainWindow: Promise<void> | null = null;
let openRequestId = 0;
let pendingFilePath = resolveStartupFilePath({
  argv: process.argv,
  cwd: process.cwd(),
  isPackaged: app.isPackaged,
});

const focusMainWindow = (): void => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
};

const publishEditorState = (state: EditorState): void => {
  editorState = state;

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const title = state.kind === 'document' ? `${state.document.fileName} — Winzig` : 'Winzig';

  mainWindow.setTitle(title);
  mainWindow.webContents.send(IPC_CHANNELS.editorStateChanged, state);
};

const openFile = async (filePath: string): Promise<void> => {
  const requestId = ++openRequestId;
  const state = await loadEditorState(filePath);

  if (requestId === openRequestId) {
    publishEditorState(state);
  }
};

const openMainWindow = async (): Promise<void> => {
  if (mainWindow) {
    focusMainWindow();
    return;
  }

  const filePath = pendingFilePath;
  pendingFilePath = null;

  if (filePath) {
    await openFile(filePath);
  }

  mainWindow = createMainWindow(() => editorState);
  mainWindow.once('closed', () => {
    mainWindow = null;
  });

  if (pendingFilePath) {
    const laterFilePath = pendingFilePath;
    pendingFilePath = null;
    await openFile(laterFilePath);
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
    pendingFilePath = filePath;

    if (app.isReady()) {
      void ensureMainWindow();
    }

    return;
  }

  void openFile(filePath).then(focusMainWindow);
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
    const filePath = resolveStartupFilePath({
      argv,
      cwd: workingDirectory,
      isPackaged: app.isPackaged,
    });

    if (filePath) {
      void openFile(filePath).then(focusMainWindow);
    } else {
      focusMainWindow();
    }
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
