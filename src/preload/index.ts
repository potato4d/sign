import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopApi, EditorState } from '../shared/desktop-api';

import { IPC_CHANNELS, isEditorState } from '../shared/desktop-api';

const desktopApi: DesktopApi = Object.freeze({
  getEditorState: async () => {
    const state: unknown = await ipcRenderer.invoke(IPC_CHANNELS.getEditorState);

    if (!isEditorState(state)) {
      throw new TypeError('The main process returned an invalid editor state.');
    }

    return state;
  },
  onEditorStateChanged: (listener: (state: EditorState) => void) => {
    const handleStateChanged = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      if (isEditorState(state)) {
        listener(state);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.editorStateChanged, handleStateChanged);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.editorStateChanged, handleStateChanged);
    };
  },
});

contextBridge.exposeInMainWorld('desktop', desktopApi);
