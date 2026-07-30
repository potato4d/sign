import { ipcMain } from 'electron';

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import type {
  CloseDecision,
  DocumentSaveResult,
  EditorWorkspaceState,
} from '../shared/desktop-api';

import { IPC_CHANNELS } from '../shared/desktop-api';

const isExpectedSender = (event: IpcMainInvokeEvent, mainWindow: BrowserWindow): boolean =>
  event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;

export interface AppIpcHandlers {
  readonly activateDocument: (documentId: string) => EditorWorkspaceState;
  readonly closeDocument: (documentId: string) => EditorWorkspaceState;
  readonly confirmClose: (documentId: string) => Promise<CloseDecision>;
  readonly createDocument: () => EditorWorkspaceState;
  readonly getWorkspaceState: () => EditorWorkspaceState;
  readonly openFiles: () => Promise<EditorWorkspaceState>;
  readonly reopenClosedDocument: () => Promise<EditorWorkspaceState>;
  readonly saveDocument: (documentId: string, contents: string) => Promise<DocumentSaveResult>;
  readonly saveDocumentAs: (documentId: string, contents: string) => Promise<DocumentSaveResult>;
}

const assertExpectedSender = (event: IpcMainInvokeEvent, mainWindow: BrowserWindow): void => {
  if (!isExpectedSender(event, mainWindow)) {
    throw new Error('Rejected IPC request from an unexpected renderer.');
  }
};

const requireString = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new TypeError('Expected a string value.');
  }

  return value;
};

const requireContents = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new TypeError('Expected document contents.');
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

  ipcMain.handle(IPC_CHANNELS.createDocument, (event): EditorWorkspaceState => {
    assertExpectedSender(event, mainWindow);
    return handlers.createDocument();
  });

  ipcMain.handle(
    IPC_CHANNELS.reopenClosedDocument,
    async (event): Promise<EditorWorkspaceState> => {
      assertExpectedSender(event, mainWindow);
      return handlers.reopenClosedDocument();
    },
  );

  ipcMain.handle(IPC_CHANNELS.confirmClose, async (event, documentId: unknown) => {
    assertExpectedSender(event, mainWindow);
    return handlers.confirmClose(requireString(documentId));
  });

  ipcMain.handle(
    IPC_CHANNELS.activateDocument,
    (event, filePath: unknown): EditorWorkspaceState => {
      assertExpectedSender(event, mainWindow);
      return handlers.activateDocument(requireString(filePath));
    },
  );

  ipcMain.handle(IPC_CHANNELS.closeDocument, (event, filePath: unknown): EditorWorkspaceState => {
    assertExpectedSender(event, mainWindow);
    return handlers.closeDocument(requireString(filePath));
  });

  ipcMain.handle(
    IPC_CHANNELS.saveDocument,
    async (event, documentId: unknown, contents: unknown): Promise<DocumentSaveResult> => {
      assertExpectedSender(event, mainWindow);
      return handlers.saveDocument(requireString(documentId), requireContents(contents));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.saveDocumentAs,
    async (event, documentId: unknown, contents: unknown): Promise<DocumentSaveResult> => {
      assertExpectedSender(event, mainWindow);
      return handlers.saveDocumentAs(requireString(documentId), requireContents(contents));
    },
  );

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.activateDocument);
    ipcMain.removeHandler(IPC_CHANNELS.closeDocument);
    ipcMain.removeHandler(IPC_CHANNELS.confirmClose);
    ipcMain.removeHandler(IPC_CHANNELS.createDocument);
    ipcMain.removeHandler(IPC_CHANNELS.getWorkspaceState);
    ipcMain.removeHandler(IPC_CHANNELS.openFiles);
    ipcMain.removeHandler(IPC_CHANNELS.reopenClosedDocument);
    ipcMain.removeHandler(IPC_CHANNELS.saveDocument);
    ipcMain.removeHandler(IPC_CHANNELS.saveDocumentAs);
  };
};
