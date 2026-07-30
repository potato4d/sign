import { ipcMain } from 'electron';

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import type { EditorWorkspaceState } from '../shared/desktop-api';

import { IPC_CHANNELS } from '../shared/desktop-api';

const isExpectedSender = (event: IpcMainInvokeEvent, mainWindow: BrowserWindow): boolean =>
  event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;

export interface AppIpcHandlers {
  readonly activateDocument: (filePath: string) => EditorWorkspaceState;
  readonly closeDocument: (filePath: string) => EditorWorkspaceState;
  readonly getWorkspaceState: () => EditorWorkspaceState;
  readonly openFiles: () => Promise<EditorWorkspaceState>;
}

const assertExpectedSender = (event: IpcMainInvokeEvent, mainWindow: BrowserWindow): void => {
  if (!isExpectedSender(event, mainWindow)) {
    throw new Error('Rejected IPC request from an unexpected renderer.');
  }
};

const requireFilePath = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new TypeError('Expected a file path.');
  }

  return value;
};

export const registerAppIpc = (
  mainWindow: BrowserWindow,
  handlers: AppIpcHandlers,
): (() => void) => {
  ipcMain.handle(IPC_CHANNELS.getWorkspaceState, (event): EditorWorkspaceState => {
    assertExpectedSender(event, mainWindow);
    return handlers.getWorkspaceState();
  });

  ipcMain.handle(IPC_CHANNELS.openFiles, async (event): Promise<EditorWorkspaceState> => {
    assertExpectedSender(event, mainWindow);
    return handlers.openFiles();
  });

  ipcMain.handle(
    IPC_CHANNELS.activateDocument,
    (event, filePath: unknown): EditorWorkspaceState => {
      assertExpectedSender(event, mainWindow);
      return handlers.activateDocument(requireFilePath(filePath));
    },
  );

  ipcMain.handle(IPC_CHANNELS.closeDocument, (event, filePath: unknown): EditorWorkspaceState => {
    assertExpectedSender(event, mainWindow);
    return handlers.closeDocument(requireFilePath(filePath));
  });

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.activateDocument);
    ipcMain.removeHandler(IPC_CHANNELS.closeDocument);
    ipcMain.removeHandler(IPC_CHANNELS.getWorkspaceState);
    ipcMain.removeHandler(IPC_CHANNELS.openFiles);
  };
};
