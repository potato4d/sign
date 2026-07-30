import { join } from 'node:path';

import { app, BrowserWindow, nativeTheme } from 'electron';

import { APPLICATION_ENTRY } from './application-protocol';
import { registerAppIpc } from './ipc';
import { hardenWindowNavigation } from './security';

export const createMainWindow = (): BrowserWindow => {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  const trustedEntry = rendererUrl ?? APPLICATION_ENTRY;

  const mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: 'Winzig',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#11141a' : '#eef1f7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: !app.isPackaged,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  hardenWindowNavigation(mainWindow, trustedEntry);
  const disposeIpc = registerAppIpc(mainWindow);

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
