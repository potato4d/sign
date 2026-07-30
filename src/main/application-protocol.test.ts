import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { APPLICATION_ENTRY, resolveApplicationAsset } from './application-protocol';

describe('resolveApplicationAsset', () => {
  const rendererDirectory = path.join(path.sep, 'application', 'renderer');

  it('maps the application entry to the bundled renderer', () => {
    expect(resolveApplicationAsset(rendererDirectory, APPLICATION_ENTRY)).toBe(
      path.join(rendererDirectory, 'index.html'),
    );
  });

  it('maps nested assets inside the renderer directory', () => {
    expect(resolveApplicationAsset(rendererDirectory, 'winzig://app/assets/main.js')).toBe(
      path.join(rendererDirectory, 'assets', 'main.js'),
    );
  });

  it('rejects another host and encoded path traversal', () => {
    expect(resolveApplicationAsset(rendererDirectory, 'winzig://other/index.html')).toBeNull();
    expect(
      resolveApplicationAsset(rendererDirectory, 'winzig://app/%2e%2e%2fmain/index.js'),
    ).toBeNull();
  });
});
