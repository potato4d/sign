import path from 'node:path';

export const APPLICATION_SCHEME = 'sign';
export const APPLICATION_HOST = 'app';
export const APPLICATION_ENTRY = `${APPLICATION_SCHEME}://${APPLICATION_HOST}/index.html`;

export const resolveApplicationAsset = (
  rendererDirectory: string,
  requestUrl: string,
): string | null => {
  try {
    const url = new URL(requestUrl);

    if (url.protocol !== `${APPLICATION_SCHEME}:` || url.host !== APPLICATION_HOST) {
      return null;
    }

    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const rendererRoot = path.resolve(rendererDirectory);
    const assetPath = path.resolve(rendererRoot, relativePath);

    if (!assetPath.startsWith(`${rendererRoot}${path.sep}`)) {
      return null;
    }

    return assetPath;
  } catch {
    return null;
  }
};
