import { join } from 'node:path';

import { app, BrowserWindow, nativeTheme } from 'electron';

import { APPLICATION_ENTRY } from './application-protocol';
import { registerAppIpc } from './ipc';
import { hardenWindowNavigation } from './security';

import type { AppIpcHandlers } from './ipc';

export const createMainWindow = (ipcHandlers: AppIpcHandlers): BrowserWindow => {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  const trustedEntry = rendererUrl ?? APPLICATION_ENTRY;
  const workspaceState = ipcHandlers.getWorkspaceState();
  const activeDocument = workspaceState.documents.find(
    (document) => document.documentId === workspaceState.activeDocumentId,
  );

  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 560,
    minHeight: 360,
    show: false,
    title: activeDocument ? `${activeDocument.fileName} — sign` : 'sign',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: {
            x: 12,
            y: 11,
          },
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: !app.isPackaged,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      webviewTag: false,
    },
  });

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(true);
  }

  hardenWindowNavigation(mainWindow, trustedEntry);
  const disposeIpc = registerAppIpc(mainWindow, ipcHandlers);

  mainWindow.once('closed', disposeIpc);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const loadRenderer = mainWindow.loadURL(trustedEntry);

  void loadRenderer.catch((error: unknown) => {
    console.error('Failed to load the application window.', error);
    app.quit();
  });

  return mainWindow;
};
