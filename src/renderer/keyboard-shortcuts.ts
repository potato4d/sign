import type { EditorCommand } from '../shared/desktop-api';

export type ShortcutPlatform = 'macos' | 'other';

export interface ShortcutInput {
  readonly altKey: boolean;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
}

const selectDocumentCommand = (code: string): EditorCommand | null => {
  const match = /^Digit([1-9])$/.exec(code);

  return match ? (`select-document-${match[1]}` as EditorCommand) : null;
};

export const resolveKeyboardShortcut = (
  input: ShortcutInput,
  platform: ShortcutPlatform,
): EditorCommand | null => {
  if (input.repeat) {
    return null;
  }

  if (input.ctrlKey && !input.altKey && !input.metaKey) {
    if (input.code === 'Tab') {
      return input.shiftKey ? 'previous-document' : 'next-document';
    }

    if (platform === 'other' && !input.shiftKey && input.code === 'PageUp') {
      return 'previous-document';
    }

    if (platform === 'other' && !input.shiftKey && input.code === 'PageDown') {
      return 'next-document';
    }
  }

  const primaryModifier =
    platform === 'macos' ? input.metaKey && !input.ctrlKey : input.ctrlKey && !input.metaKey;

  if (
    platform === 'macos' &&
    primaryModifier &&
    input.altKey &&
    !input.shiftKey &&
    (input.code === 'ArrowLeft' || input.code === 'ArrowRight')
  ) {
    return input.code === 'ArrowLeft' ? 'previous-document' : 'next-document';
  }

  if (input.altKey && !input.ctrlKey && !input.metaKey && !input.shiftKey) {
    return input.code === 'KeyZ' ? 'toggle-word-wrap' : null;
  }

  if (!primaryModifier || input.altKey) {
    return null;
  }

  if (!input.shiftKey && input.code === 'Backslash') {
    return 'toggle-recent-files';
  }

  if (input.shiftKey) {
    switch (input.code) {
      case 'KeyP':
        return 'command-palette';
      case 'KeyS':
        return 'save-document-as';
      case 'KeyT':
        return 'reopen-closed-document';
      default:
        return null;
    }
  }

  const selectCommand = selectDocumentCommand(input.code);

  if (selectCommand) {
    return selectCommand;
  }

  switch (input.code) {
    case 'KeyN':
      return 'create-document';
    case 'KeyT':
      return platform === 'macos' ? 'create-document' : null;
    case 'KeyO':
      return 'open-files';
    case 'KeyP':
      return 'quick-switcher';
    case 'KeyS':
      return 'save-document';
    case 'KeyW':
      return 'close-active-document';
    default:
      return null;
  }
};
