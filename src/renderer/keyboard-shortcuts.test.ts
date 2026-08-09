import { describe, expect, it } from 'vitest';

import type { ShortcutInput, ShortcutPlatform } from './keyboard-shortcuts';

import { resolveKeyboardShortcut } from './keyboard-shortcuts';

const shortcut = (code: string, overrides: Partial<ShortcutInput> = {}): ShortcutInput => ({
  altKey: false,
  code,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  shiftKey: false,
  ...overrides,
});

const resolve = (
  code: string,
  overrides: Partial<ShortcutInput>,
  platform: ShortcutPlatform = 'other',
) => resolveKeyboardShortcut(shortcut(code, overrides), platform);

describe('resolveKeyboardShortcut', () => {
  it('maps file commands through the platform primary modifier', () => {
    expect(resolve('KeyN', { ctrlKey: true })).toBe('create-document');
    expect(resolve('KeyO', { ctrlKey: true })).toBe('open-files');
    expect(resolve('KeyS', { ctrlKey: true })).toBe('save-document');
    expect(resolve('KeyS', { ctrlKey: true, shiftKey: true })).toBe('save-document-as');
    expect(resolve('KeyW', { ctrlKey: true })).toBe('close-active-document');
    expect(resolve('KeyT', { ctrlKey: true, shiftKey: true })).toBe('reopen-closed-document');
    expect(resolve('KeyN', { metaKey: true }, 'macos')).toBe('create-document');
    expect(resolve('KeyT', { metaKey: true }, 'macos')).toBe('create-document');
    expect(resolve('KeyT', { metaKey: true, shiftKey: true }, 'macos')).toBe(
      'reopen-closed-document',
    );
    expect(resolve('KeyS', { metaKey: true }, 'macos')).toBe('save-document');
    expect(resolve('KeyT', { ctrlKey: true })).toBeNull();
  });

  it('does not treat the macOS Control key as the primary modifier', () => {
    expect(resolve('KeyO', { ctrlKey: true }, 'macos')).toBeNull();
    expect(resolve('Backslash', { ctrlKey: true }, 'macos')).toBeNull();
    expect(resolve('KeyO', { metaKey: true }, 'macos')).toBe('open-files');
  });

  it('maps quick access and word wrap commands', () => {
    expect(resolve('KeyP', { ctrlKey: true })).toBe('quick-switcher');
    expect(resolve('KeyP', { ctrlKey: true, shiftKey: true })).toBe('command-palette');
    expect(resolve('KeyZ', { altKey: true })).toBe('toggle-word-wrap');
    expect(resolve('Backslash', { ctrlKey: true })).toBe('toggle-recent-files');
    expect(resolve('Backslash', { metaKey: true }, 'macos')).toBe('toggle-recent-files');
  });

  it('maps direct and relative tab navigation aliases', () => {
    expect(resolve('Digit1', { ctrlKey: true })).toBe('select-document-1');
    expect(resolve('Digit9', { ctrlKey: true })).toBe('select-document-9');
    expect(resolve('Tab', { ctrlKey: true })).toBe('next-document');
    expect(resolve('Tab', { ctrlKey: true, shiftKey: true })).toBe('previous-document');
    expect(resolve('PageUp', { ctrlKey: true })).toBe('previous-document');
    expect(resolve('PageDown', { ctrlKey: true })).toBe('next-document');
    expect(resolve('ArrowLeft', { altKey: true, metaKey: true }, 'macos')).toBe(
      'previous-document',
    );
    expect(resolve('PageDown', { ctrlKey: true }, 'macos')).toBeNull();
  });

  it('ignores unrelated, modified, and repeated inputs', () => {
    expect(resolve('KeyS', {})).toBeNull();
    expect(resolve('KeyS', { altKey: true, ctrlKey: true })).toBeNull();
    expect(resolve('KeyS', { ctrlKey: true, repeat: true })).toBeNull();
    expect(resolve('Backslash', { altKey: true, ctrlKey: true })).toBeNull();
    expect(resolve('Backslash', { ctrlKey: true, shiftKey: true })).toBeNull();
    expect(resolve('Backslash', { ctrlKey: true, repeat: true })).toBeNull();
  });
});
