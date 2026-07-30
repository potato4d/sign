import type { BrowserWindow, Session } from 'electron';

const DEVELOPMENT_PROTOCOLS = new Set(['http:', 'https:']);
const APPLICATION_PROTOCOLS = new Set(['winzig:']);

export const isTrustedRendererUrl = (candidate: string, configuredEntry: string): boolean => {
  try {
    const candidateUrl = new URL(candidate);
    const entryUrl = new URL(configuredEntry);

    if (APPLICATION_PROTOCOLS.has(entryUrl.protocol)) {
      return candidateUrl.protocol === entryUrl.protocol && candidateUrl.host === entryUrl.host;
    }

    if (!DEVELOPMENT_PROTOCOLS.has(entryUrl.protocol)) {
      return false;
    }

    return candidateUrl.protocol === entryUrl.protocol && candidateUrl.origin === entryUrl.origin;
  } catch {
    return false;
  }
};

export const hardenWindowNavigation = (
  mainWindow: BrowserWindow,
  configuredEntry: string,
): void => {
  const preventUntrustedNavigation = (event: Electron.Event, targetUrl: string): void => {
    if (!isTrustedRendererUrl(targetUrl, configuredEntry)) {
      event.preventDefault();
    }
  };

  mainWindow.webContents.on('will-navigate', preventUntrustedNavigation);
  mainWindow.webContents.on('will-redirect', preventUntrustedNavigation);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
};

export const configureSessionSecurity = (defaultSession: Session): void => {
  defaultSession.setPermissionCheckHandler(() => false);
  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
};
