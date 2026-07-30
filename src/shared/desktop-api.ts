export const IPC_CHANNELS = {
  getAppInfo: 'app:get-info',
} as const;

export interface AppInfo {
  readonly name: string;
  readonly version: string;
}

export interface DesktopApi {
  getAppInfo(): Promise<AppInfo>;
}
