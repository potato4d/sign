import './monaco-environment';
import './styles.css';

import * as monaco from 'monaco-editor';

import type { EditorWorkspaceState, OpenedDocument } from '../shared/desktop-api';

interface EditorTab {
  readonly contentListener: monaco.IDisposable;
  readonly initialAlternativeVersionId: number;
  readonly model: monaco.editor.ITextModel;
  viewState: monaco.editor.ICodeEditorViewState | null;
}

const editorElement = document.querySelector<HTMLElement>('#editor');
const noticeElement = document.querySelector<HTMLDivElement>('#notice');
const openFilesButton = document.querySelector<HTMLButtonElement>('#open-files');
const tabListElement = document.querySelector<HTMLDivElement>('#tab-list');

if (!editorElement || !noticeElement || !openFilesButton || !tabListElement) {
  throw new Error('The editor workspace is incomplete.');
}

const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
const highContrast = window.matchMedia('(prefers-contrast: more)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const emptyModel = monaco.editor.createModel('', 'plaintext');
const tabsByFilePath = new Map<string, EditorTab>();
const tabButtonsByFilePath = new Map<string, HTMLButtonElement>();
let workspaceState: EditorWorkspaceState = {
  activeFilePath: null,
  documents: [],
  error: null,
};

const themeForPreferences = (): string => {
  if (highContrast.matches) {
    return darkMode.matches ? 'hc-black' : 'hc-light';
  }

  return darkMode.matches ? 'vs-dark' : 'vs';
};

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
  model: emptyModel,
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

const documentForPath = (filePath: string | null): OpenedDocument | undefined =>
  workspaceState.documents.find((document) => document.filePath === filePath);

const isTabDirty = (tab: EditorTab): boolean =>
  tab.model.getAlternativeVersionId() !== tab.initialAlternativeVersionId;

const saveViewState = (filePath: string | null): void => {
  if (!filePath) {
    return;
  }

  const tab = tabsByFilePath.get(filePath);

  if (tab && editor.getModel() === tab.model) {
    tab.viewState = editor.saveViewState();
  }
};

const updateTabPresentation = (): void => {
  for (const [filePath, button] of tabButtonsByFilePath) {
    const tab = tabsByFilePath.get(filePath);
    const document = documentForPath(filePath);
    const isActive = filePath === workspaceState.activeFilePath;
    const isDirty = tab ? isTabDirty(tab) : false;

    button.setAttribute('aria-selected', String(isActive));
    button.classList.toggle('tab__select--active', isActive);

    if (document) {
      button.setAttribute(
        'aria-label',
        isDirty ? `${document.fileName}, modified` : document.fileName,
      );
    }

    const tabItem = button.closest<HTMLElement>('.tab');
    tabItem?.classList.toggle('tab--active', isActive);
    tabItem?.classList.toggle('tab--dirty', isDirty);
  }
};

const activateTabLocally = (filePath: string, focusEditor = true): void => {
  const tab = tabsByFilePath.get(filePath);
  const openedDocument = documentForPath(filePath);

  if (!tab || !openedDocument) {
    return;
  }

  if (workspaceState.activeFilePath !== filePath) {
    saveViewState(workspaceState.activeFilePath);
  }

  workspaceState = {
    ...workspaceState,
    activeFilePath: filePath,
  };

  editor.setModel(tab.model);

  if (tab.viewState) {
    editor.restoreViewState(tab.viewState);
  }

  document.title = `${openedDocument.fileName} — Winzig`;
  updateTabPresentation();
  tabButtonsByFilePath.get(filePath)?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });

  if (focusEditor) {
    editor.focus();
  }
};

const activateDocument = async (filePath: string): Promise<void> => {
  activateTabLocally(filePath);

  try {
    applyWorkspaceState(await window.desktop.activateDocument(filePath));
  } catch {
    showNotice('The selected tab could not be activated.');
  }
};

const closeDocument = async (filePath: string): Promise<void> => {
  const tab = tabsByFilePath.get(filePath);
  const document = documentForPath(filePath);

  if (!tab || !document) {
    return;
  }

  if (
    isTabDirty(tab) &&
    !window.confirm(`Close ${document.fileName}? Unsaved changes will be discarded.`)
  ) {
    return;
  }

  try {
    applyWorkspaceState(await window.desktop.closeDocument(filePath));
  } catch {
    showNotice('The tab could not be closed.');
  }
};

const renderTabs = (): void => {
  const fragment = document.createDocumentFragment();
  tabButtonsByFilePath.clear();

  for (const document of workspaceState.documents) {
    const tab = tabsByFilePath.get(document.filePath);
    const tabItem = window.document.createElement('div');
    const selectButton = window.document.createElement('button');
    const fileName = window.document.createElement('span');
    const dirtyIndicator = window.document.createElement('span');
    const closeButton = window.document.createElement('button');

    tabItem.className = 'tab';
    tabItem.dataset['filePath'] = document.filePath;

    selectButton.className = 'tab__select';
    selectButton.type = 'button';
    selectButton.title = document.filePath;
    selectButton.setAttribute('role', 'tab');
    selectButton.setAttribute('aria-controls', 'editor');

    fileName.className = 'tab__name';
    fileName.textContent = document.fileName;

    dirtyIndicator.className = 'tab__dirty';
    dirtyIndicator.textContent = '●';
    dirtyIndicator.setAttribute('aria-hidden', 'true');

    closeButton.className = 'tab__close';
    closeButton.type = 'button';
    closeButton.title = `Close ${document.fileName}`;
    closeButton.setAttribute('aria-label', `Close ${document.fileName}`);
    closeButton.textContent = '×';

    selectButton.addEventListener('pointerdown', (event) => {
      if (event.button === 0) {
        activateTabLocally(document.filePath, false);
      }
    });
    selectButton.addEventListener('click', () => {
      void activateDocument(document.filePath);
    });
    selectButton.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        void closeDocument(document.filePath);
      }
    });
    closeButton.addEventListener('click', () => {
      void closeDocument(document.filePath);
    });

    selectButton.append(dirtyIndicator, fileName);
    tabItem.append(selectButton, closeButton);
    fragment.append(tabItem);
    tabButtonsByFilePath.set(document.filePath, selectButton);

    if (tab && isTabDirty(tab)) {
      tabItem.classList.add('tab--dirty');
    }
  }

  tabListElement.replaceChildren(fragment);
  updateTabPresentation();
};

const createTab = (document: OpenedDocument): EditorTab => {
  const model = monaco.editor.createModel(
    document.contents,
    undefined,
    monaco.Uri.file(document.filePath),
  );
  const initialAlternativeVersionId = model.getAlternativeVersionId();
  const contentListener = model.onDidChangeContent(() => {
    updateTabPresentation();
  });

  return {
    contentListener,
    initialAlternativeVersionId,
    model,
    viewState: null,
  };
};

const applyWorkspaceState = (state: EditorWorkspaceState): void => {
  saveViewState(workspaceState.activeFilePath);
  workspaceState = state;
  const openFilePaths = new Set(state.documents.map((document) => document.filePath));

  for (const document of state.documents) {
    if (!tabsByFilePath.has(document.filePath)) {
      tabsByFilePath.set(document.filePath, createTab(document));
    }
  }

  for (const [filePath, tab] of tabsByFilePath) {
    if (openFilePaths.has(filePath)) {
      continue;
    }

    if (editor.getModel() === tab.model) {
      editor.setModel(emptyModel);
    }

    tab.contentListener.dispose();
    tab.model.dispose();
    tabsByFilePath.delete(filePath);
  }

  renderTabs();

  if (state.activeFilePath && tabsByFilePath.has(state.activeFilePath)) {
    activateTabLocally(state.activeFilePath);
  } else {
    editor.setModel(emptyModel);
    document.title = 'Winzig';
  }

  if (state.error) {
    showNotice(`${state.error.message} ${state.error.filePath}`);
  } else {
    hideNotice();
  }
};

const openFiles = async (): Promise<void> => {
  try {
    applyWorkspaceState(await window.desktop.openFiles());
  } catch {
    showNotice('Files could not be opened.');
  }
};

const activateRelativeTab = (offset: number): void => {
  const filePaths = workspaceState.documents.map((document) => document.filePath);

  if (filePaths.length === 0) {
    return;
  }

  const currentIndex = Math.max(0, filePaths.indexOf(workspaceState.activeFilePath ?? ''));
  const nextIndex = (currentIndex + offset + filePaths.length) % filePaths.length;
  const nextFilePath = filePaths[nextIndex];

  if (nextFilePath) {
    void activateDocument(nextFilePath);
  }
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

openFilesButton.addEventListener('click', () => {
  void openFiles();
});
window.addEventListener('keydown', (event) => {
  const primaryModifier = event.metaKey || event.ctrlKey;

  if (primaryModifier && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    void openFiles();
    return;
  }

  if (event.ctrlKey && event.key === 'Tab') {
    event.preventDefault();
    activateRelativeTab(event.shiftKey ? -1 : 1);
  }
});

darkMode.addEventListener('change', updateTheme);
highContrast.addEventListener('change', updateTheme);
reducedMotion.addEventListener('change', updateMotionPreferences);

const disposeWorkspaceStateListener = window.desktop.onWorkspaceStateChanged(applyWorkspaceState);

const initializeEditor = async (): Promise<void> => {
  try {
    applyWorkspaceState(await window.desktop.getWorkspaceState());
  } catch {
    showNotice('The initial workspace state could not be loaded.');
  }
};

window.addEventListener('beforeunload', () => {
  disposeWorkspaceStateListener();
  darkMode.removeEventListener('change', updateTheme);
  highContrast.removeEventListener('change', updateTheme);
  reducedMotion.removeEventListener('change', updateMotionPreferences);

  for (const tab of tabsByFilePath.values()) {
    tab.contentListener.dispose();
    tab.model.dispose();
  }

  emptyModel.dispose();
  editor.dispose();
});

void initializeEditor();
