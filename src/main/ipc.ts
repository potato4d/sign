import { ipcMain } from 'electron';

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import type { EditorState } from '../shared/desktop-api';

import { IPC_CHANNELS } from '../shared/desktop-api';

const isExpectedSender = (event: IpcMainInvokeEvent, mainWindow: BrowserWindow): boolean =>
  event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;

export const registerAppIpc = (
  mainWindow: BrowserWindow,
  getEditorState: () => EditorState,
): (() => void) => {
  ipcMain.handle(IPC_CHANNELS.getEditorState, (event): EditorState => {
    if (!isExpectedSender(event, mainWindow)) {
      throw new Error('Rejected IPC request from an unexpected renderer.');
    }

    return getEditorState();
  });

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.getEditorState);
  };
};
