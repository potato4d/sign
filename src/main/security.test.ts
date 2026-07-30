import { describe, expect, it } from 'vitest';

import { isTrustedRendererUrl } from './security';

describe('isTrustedRendererUrl', () => {
  it('accepts the packaged application origin', () => {
    const entry = 'winzig://app/index.html';

    expect(isTrustedRendererUrl('winzig://app/settings', entry)).toBe(true);
  });

  it('rejects a different packaged application host', () => {
    const entry = 'winzig://app/index.html';

    expect(isTrustedRendererUrl('winzig://other/index.html', entry)).toBe(false);
  });

  it('accepts development navigation on the configured origin', () => {
    const entry = 'http://localhost:3000/index.html';

    expect(isTrustedRendererUrl('http://localhost:3000/settings', entry)).toBe(true);
  });

  it('rejects a different development origin or protocol', () => {
    const entry = 'http://localhost:3000/index.html';

    expect(isTrustedRendererUrl('http://localhost:4000/index.html', entry)).toBe(false);
    expect(isTrustedRendererUrl('https://localhost:3000/index.html', entry)).toBe(false);
  });

  it('rejects malformed and unsupported entries', () => {
    expect(isTrustedRendererUrl('not a url', 'winzig://app/index.html')).toBe(false);
    expect(isTrustedRendererUrl('about:blank', 'about:blank')).toBe(false);
  });
});
