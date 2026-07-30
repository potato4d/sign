import { app, ipcMain } from 'electron';

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import type { AppInfo } from '../shared/desktop-api';

import { IPC_CHANNELS } from '../shared/desktop-api';

const isExpectedSender = (event: IpcMainInvokeEvent, mainWindow: BrowserWindow): boolean =>
  event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;

export const registerAppIpc = (mainWindow: BrowserWindow): (() => void) => {
  ipcMain.handle(IPC_CHANNELS.getAppInfo, (event): AppInfo => {
    if (!isExpectedSender(event, mainWindow)) {
      throw new Error('Rejected IPC request from an unexpected renderer.');
    }

    return {
      name: app.getName(),
      version: app.getVersion(),
    };
  });

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.getAppInfo);
  };
};
