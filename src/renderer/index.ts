import './monaco-environment';
import './styles.css';

import * as monaco from 'monaco-editor';

import type { EditorState } from '../shared/desktop-api';

const editorElement = document.querySelector<HTMLElement>('#editor');
const noticeElement = document.querySelector<HTMLDivElement>('#notice');

if (!editorElement || !noticeElement) {
  throw new Error('The editor host is incomplete.');
}

const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
const highContrast = window.matchMedia('(prefers-contrast: more)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const themeForPreferences = (): string => {
  if (highContrast.matches) {
    return darkMode.matches ? 'hc-black' : 'hc-light';
  }

  return darkMode.matches ? 'vs-dark' : 'vs';
};

const initialModel = monaco.editor.createModel('', 'plaintext');
const editor = monaco.editor.create(editorElement, {
  accessibilitySupport: 'auto',
  automaticLayout: true,
  bracketPairColorization: {
    enabled: true,
  },
  cursorBlinking: reducedMotion.matches ? 'solid' : 'blink',
  cursorSmoothCaretAnimation: reducedMotion.matches ? 'off' : 'on',
  fixedOverflowWidgets: true,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontLigatures: false,
  fontSize: 13,
  guides: {
    bracketPairs: true,
    indentation: true,
  },
  minimap: {
    enabled: true,
  },
  model: initialModel,
  padding: {
    bottom: 12,
    top: 12,
  },
  renderWhitespace: 'selection',
  scrollBeyondLastLine: false,
  smoothScrolling: !reducedMotion.matches,
  stickyScroll: {
    enabled: true,
  },
  theme: themeForPreferences(),
});

const showNotice = (message: string): void => {
  noticeElement.textContent = message;
  noticeElement.hidden = false;
};

const hideNotice = (): void => {
  noticeElement.hidden = true;
  noticeElement.textContent = '';
};

const applyEditorState = (state: EditorState): void => {
  if (state.kind === 'empty') {
    hideNotice();
    document.title = 'Winzig';
    return;
  }

  if (state.kind === 'error') {
    showNotice(`${state.message} ${state.filePath}`);
    return;
  }

  hideNotice();

  const previousModel = editor.getModel();
  const documentUri = monaco.Uri.file(state.document.filePath);
  const existingModel = monaco.editor.getModel(documentUri);

  if (existingModel && existingModel !== previousModel) {
    existingModel.dispose();
  }

  const documentModel =
    existingModel === previousModel
      ? existingModel
      : monaco.editor.createModel(state.document.contents, undefined, documentUri);

  if (!documentModel) {
    showNotice('The editor could not create a document model.');
    return;
  }

  if (documentModel === previousModel) {
    documentModel.setValue(state.document.contents);
  } else {
    editor.setModel(documentModel);
    previousModel?.dispose();
  }

  document.title = `${state.document.fileName} — Winzig`;
  editor.setPosition({ column: 1, lineNumber: 1 });
  editor.revealPosition({ column: 1, lineNumber: 1 });
  editor.focus();
};

const updateTheme = (): void => {
  monaco.editor.setTheme(themeForPreferences());
};

const updateMotionPreferences = (): void => {
  editor.updateOptions({
    cursorBlinking: reducedMotion.matches ? 'solid' : 'blink',
    cursorSmoothCaretAnimation: reducedMotion.matches ? 'off' : 'on',
    smoothScrolling: !reducedMotion.matches,
  });
};

darkMode.addEventListener('change', updateTheme);
highContrast.addEventListener('change', updateTheme);
reducedMotion.addEventListener('change', updateMotionPreferences);

const disposeEditorStateListener = window.desktop.onEditorStateChanged(applyEditorState);

const initializeEditor = async (): Promise<void> => {
  try {
    applyEditorState(await window.desktop.getEditorState());
  } catch {
    showNotice('The initial editor state could not be loaded.');
  }
};

window.addEventListener('beforeunload', () => {
  disposeEditorStateListener();
  darkMode.removeEventListener('change', updateTheme);
  highContrast.removeEventListener('change', updateTheme);
  reducedMotion.removeEventListener('change', updateMotionPreferences);
  editor.getModel()?.dispose();
  editor.dispose();
});

void initializeEditor();
