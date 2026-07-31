import { pathToFileURL } from 'node:url';

import { net, protocol } from 'electron';

import { APPLICATION_SCHEME, resolveApplicationAsset } from './application-protocol';

export const registerApplicationScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APPLICATION_SCHEME,
      privileges: {
        codeCache: true,
        secure: true,
        standard: true,
        supportFetchAPI: true,
      },
    },
  ]);
};

export const registerApplicationProtocol = (rendererDirectory: string): void => {
  protocol.handle(APPLICATION_SCHEME, (request) => {
    const assetPath = resolveApplicationAsset(rendererDirectory, request.url);

    if (!assetPath) {
      return new Response(null, {
        status: 404,
        statusText: 'Not Found',
      });
    }

    return net.fetch(pathToFileURL(assetPath).href);
  });
};
