import { join } from 'node:path';

import { app, BrowserWindow, session } from 'electron';

import { createMainWindow } from './create-main-window';
import {
  registerApplicationProtocol,
  registerApplicationScheme,
} from './register-application-protocol';
import { configureSessionSecurity } from './security';

registerApplicationScheme();
app.enableSandbox();

app.on('web-contents-created', (_event, webContents) => {
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

void app.whenReady().then(() => {
  configureSessionSecurity(session.defaultSession);
  registerApplicationProtocol(join(__dirname, '../renderer'));
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
