import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type { File as DroppedFile } from 'node:buffer';

import type {
  CloseDecision,
  DesktopApi,
  DesktopPlatform,
  DocumentSaveResult,
  EditorCommand,
  EditorWorkspaceState,
  RecentFile,
} from '../shared/desktop-api';

import {
  IPC_CHANNELS,
  MAXIMUM_DROPPED_FILES,
  isCloseDecision,
  isDocumentSaveResult,
  isEditorCommand,
  isEditorWorkspaceState,
  isRecentFileList,
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

const invokeRecentFiles = async (): Promise<readonly RecentFile[]> => {
  const recentFiles: unknown = await ipcRenderer.invoke(IPC_CHANNELS.getRecentFiles);

  if (!isRecentFileList(recentFiles)) {
    throw new TypeError('The main process returned an invalid recent file list.');
  }

  return recentFiles;
};

const pathsForDroppedFiles = (files: readonly unknown[]): readonly string[] => {
  if (!Array.isArray(files) || files.length > MAXIMUM_DROPPED_FILES) {
    throw new TypeError('Expected a bounded list of dropped files.');
  }

  const filePaths = new Set<string>();

  for (const file of files) {
    const filePath = webUtils.getPathForFile(file as DroppedFile);

    if (filePath) {
      filePaths.add(filePath);
    }
  }

  return [...filePaths];
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
  getRecentFiles: invokeRecentFiles,
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
  onRecentFilesChanged: (listener: (recentFiles: readonly RecentFile[]) => void) => {
    const handleRecentFilesChanged = (
      _event: Electron.IpcRendererEvent,
      recentFiles: unknown,
    ): void => {
      if (isRecentFileList(recentFiles)) {
        listener(recentFiles);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.recentFilesChanged, handleRecentFilesChanged);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.recentFilesChanged, handleRecentFilesChanged);
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
  openDroppedFiles: (files: readonly unknown[]) =>
    invokeWorkspaceState(IPC_CHANNELS.openDroppedFiles, pathsForDroppedFiles(files)),
  openFiles: () => invokeWorkspaceState(IPC_CHANNELS.openFiles),
  openRecentFile: (recentFileId: string) =>
    invokeWorkspaceState(IPC_CHANNELS.openRecentFile, recentFileId),
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
