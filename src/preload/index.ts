import { contextBridge, ipcRenderer } from 'electron';

import type { AppInfo, DesktopApi } from '../shared/desktop-api';

import { IPC_CHANNELS } from '../shared/desktop-api';

const desktopApi: DesktopApi = Object.freeze({
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as Promise<AppInfo>,
});

contextBridge.exposeInMainWorld('desktop', desktopApi);
