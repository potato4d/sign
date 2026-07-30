import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopApi, EditorWorkspaceState } from '../shared/desktop-api';

import { IPC_CHANNELS, isEditorWorkspaceState } from '../shared/desktop-api';

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

const desktopApi: DesktopApi = Object.freeze({
  activateDocument: (filePath: string) =>
    invokeWorkspaceState(IPC_CHANNELS.activateDocument, filePath),
  closeDocument: (filePath: string) => invokeWorkspaceState(IPC_CHANNELS.closeDocument, filePath),
  getWorkspaceState: () => invokeWorkspaceState(IPC_CHANNELS.getWorkspaceState),
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
});

contextBridge.exposeInMainWorld('desktop', desktopApi);
