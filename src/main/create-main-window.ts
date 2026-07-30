import { join } from 'node:path';

import { app, BrowserWindow, nativeTheme } from 'electron';

import { APPLICATION_ENTRY } from './application-protocol';
import { registerAppIpc } from './ipc';
import { hardenWindowNavigation } from './security';

import type { EditorState } from '../shared/desktop-api';

export const createMainWindow = (getEditorState: () => EditorState): BrowserWindow => {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  const trustedEntry = rendererUrl ?? APPLICATION_ENTRY;
  const editorState = getEditorState();

  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 560,
    minHeight: 360,
    show: false,
    title: editorState.kind === 'document' ? `${editorState.document.fileName} — Winzig` : 'Winzig',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
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
  const disposeIpc = registerAppIpc(mainWindow, getEditorState);

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
