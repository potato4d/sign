import { contextBridge, ipcRenderer } from 'electron';

import type {
  CloseDecision,
  DesktopApi,
  DesktopPlatform,
  DocumentSaveResult,
  EditorCommand,
  EditorWorkspaceState,
} from '../shared/desktop-api';

import {
  IPC_CHANNELS,
  isCloseDecision,
  isDocumentSaveResult,
  isEditorCommand,
  isEditorWorkspaceState,
} from '../shared/desktop-api';

const invokeWorkspaceState = async (
  channel: string,
  ...arguments_: readonly unknown[]
): Promise<EditorWorkspaceState> => {
  const state: unknown = await ipcRenderer.invoke(channel, ...arguments_);

  if (!isEditorWorkspaceState(state)) {
    throw new TypeError('The main process returned an invalid workspace state.');
  }

  return state;
};

const invokeSave = async (
  channel: string,
  documentId: string,
  contents: string,
): Promise<DocumentSaveResult> => {
  const result: unknown = await ipcRenderer.invoke(channel, documentId, contents);

  if (!isDocumentSaveResult(result)) {
    throw new TypeError('The main process returned an invalid save result.');
  }

  return result;
};

const desktopApi: DesktopApi = Object.freeze({
  activateDocument: (documentId: string) =>
    invokeWorkspaceState(IPC_CHANNELS.activateDocument, documentId),
  closeDocument: (documentId: string) =>
    invokeWorkspaceState(IPC_CHANNELS.closeDocument, documentId),
  confirmClose: async (documentId: string): Promise<CloseDecision> => {
    const decision: unknown = await ipcRenderer.invoke(IPC_CHANNELS.confirmClose, documentId);

    if (!isCloseDecision(decision)) {
      throw new TypeError('The main process returned an invalid close decision.');
    }

    return decision;
  },
  createDocument: () => invokeWorkspaceState(IPC_CHANNELS.createDocument),
  getWorkspaceState: () => invokeWorkspaceState(IPC_CHANNELS.getWorkspaceState),
  onEditorCommand: (listener: (command: EditorCommand) => void) => {
    const handleCommand = (_event: Electron.IpcRendererEvent, command: unknown): void => {
      if (isEditorCommand(command)) {
        listener(command);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.editorCommand, handleCommand);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.editorCommand, handleCommand);
    };
  },
  onWorkspaceStateChanged: (listener: (state: EditorWorkspaceState) => void) => {
    const handleStateChanged = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      if (isEditorWorkspaceState(state)) {
        listener(state);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.workspaceStateChanged, handleStateChanged);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.workspaceStateChanged, handleStateChanged);
    };
  },
  openFiles: () => invokeWorkspaceState(IPC_CHANNELS.openFiles),
  platform: (process.platform === 'darwin' || process.platform === 'win32'
    ? process.platform
    : 'linux') satisfies DesktopPlatform,
  quitApplicationIfEmpty: async (): Promise<boolean> => {
    const didQuit: unknown = await ipcRenderer.invoke(IPC_CHANNELS.quitApplicationIfEmpty);

    if (typeof didQuit !== 'boolean') {
      throw new TypeError('The main process returned an invalid quit result.');
    }

    return didQuit;
  },
  reopenClosedDocument: () => invokeWorkspaceState(IPC_CHANNELS.reopenClosedDocument),
  saveDocument: (documentId: string, contents: string) =>
    invokeSave(IPC_CHANNELS.saveDocument, documentId, contents),
  saveDocumentAs: (documentId: string, contents: string) =>
    invokeSave(IPC_CHANNELS.saveDocumentAs, documentId, contents),
});

contextBridge.exposeInMainWorld('desktop', desktopApi);
