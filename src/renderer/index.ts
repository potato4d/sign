import './styles.css';

import type {
  EditorCommand,
  EditorWorkspaceState,
  OpenedDocument,
  RecentFile,
} from '../shared/desktop-api';
import type * as Monaco from 'monaco-editor';
import type { DocumentSnapshot } from './document-changes';

import { MAXIMUM_RECENT_FILES } from '../shared/desktop-api';
import { captureDocumentSnapshot, isDocumentDirty } from './document-changes';
import { resolveKeyboardShortcut } from './keyboard-shortcuts';

interface EditorTab {
  readonly contentListener: Monaco.IDisposable;
  readonly model: Monaco.editor.ITextModel;
  savedSnapshot: DocumentSnapshot;
  viewState: Monaco.editor.ICodeEditorViewState | null;
}

const requireElement = <ElementType extends Element>(selector: string): ElementType => {
  const element = document.querySelector<ElementType>(selector);

  if (!element) {
    throw new Error(`The editor workspace is missing ${selector}.`);
  }

  return element;
};

const editorElement = requireElement<HTMLElement>('#editor');
const emptyWorkspaceElement = requireElement<HTMLElement>('#empty-workspace');
const createEmptyFileButton = requireElement<HTMLButtonElement>('#create-empty-file');
const dropOverlayElement = requireElement<HTMLDivElement>('#drop-overlay');
const openEmptyFileButton = requireElement<HTMLButtonElement>('#open-empty-file');
const noticeElement = requireElement<HTMLDivElement>('#notice');
const openFilesButton = requireElement<HTMLButtonElement>('#open-files');
const quickSwitcherElement = requireElement<HTMLDialogElement>('#quick-switcher');
const quickSwitcherInput = requireElement<HTMLInputElement>('#quick-switcher-input');
const quickSwitcherResults = requireElement<HTMLDivElement>('#quick-switcher-results');
const recentFilesEmptyElement = requireElement<HTMLParagraphElement>('#recent-files-empty');
const recentFilesListElement = requireElement<HTMLUListElement>('#recent-files-list');
const recentFilesPaneElement = requireElement<HTMLElement>('#recent-files-pane');
const tabListElement = requireElement<HTMLDivElement>('#tab-list');
const toggleRecentFilesButton = requireElement<HTMLButtonElement>('#toggle-recent-files');

const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
const highContrast = window.matchMedia('(prefers-contrast: more)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const tabsByDocumentId = new Map<string, EditorTab>();
const tabButtonsByDocumentId = new Map<string, HTMLButtonElement>();
const shortcutPlatform = window.desktop.platform === 'darwin' ? 'macos' : 'other';
const filePathSeparator = window.desktop.platform === 'win32' ? '\\' : '/';
let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let fileDragDepth = 0;
let editorInitialization: Promise<void> | null = null;
let monaco: typeof Monaco | null = null;
let quickSwitcherDocumentIds: string[] = [];
let quickSwitcherSelection = 0;
let recentFiles: readonly RecentFile[] = [];
let recentFilesLoadFailed = false;
let recentFilesVisible = false;
let wordWrapEnabled = false;
let workspaceState: EditorWorkspaceState = {
  activeDocumentId: null,
  documents: [],
  error: null,
};
document.body.classList.add(`platform-${window.desktop.platform}`);

const themeForPreferences = (): string => {
  if (highContrast.matches) {
    return darkMode.matches ? 'hc-black' : 'hc-light';
  }

  return darkMode.matches ? 'vs-dark' : 'vs';
};

const showNotice = (message: string): void => {
  noticeElement.textContent = message;
  noticeElement.hidden = false;
};

const hideNotice = (): void => {
  noticeElement.hidden = true;
  noticeElement.textContent = '';
};

const hasFiles = (dataTransfer: DataTransfer | null): dataTransfer is DataTransfer =>
  dataTransfer !== null && [...dataTransfer.types].includes('Files');

const setDropOverlayVisible = (isVisible: boolean): void => {
  dropOverlayElement.classList.toggle('drop-overlay--visible', isVisible);
  dropOverlayElement.setAttribute('aria-hidden', String(!isVisible));
};

const openDroppedFiles = async (files: readonly File[]): Promise<void> => {
  if (files.length === 0) {
    return;
  }

  try {
    applyWorkspaceState(await window.desktop.openDroppedFiles(files));
  } catch {
    showNotice('The dropped files could not be opened.');
  }
};

const documentForId = (documentId: string | null): OpenedDocument | undefined =>
  workspaceState.documents.find((document) => document.documentId === documentId);

const normalizeFilePathForComparison = (filePath: string): string =>
  window.desktop.platform === 'win32' ? filePath.replaceAll('/', '\\') : filePath;

const fullPathForRecentFile = (recentFile: RecentFile): string => {
  const separator = recentFile.directoryPath.endsWith(filePathSeparator) ? '' : filePathSeparator;

  return `${recentFile.directoryPath}${separator}${recentFile.fileName}`;
};

const abbreviatedDirectoryPath = (directoryPath: string): string => {
  const segments = directoryPath.split(filePathSeparator).filter(Boolean);

  return segments.length > 2
    ? `…${filePathSeparator}${segments.slice(-2).join(filePathSeparator)}`
    : directoryPath;
};

const isActiveRecentFile = (recentFile: RecentFile): boolean => {
  const activeDocument = documentForId(workspaceState.activeDocumentId);

  return Boolean(
    activeDocument?.filePath &&
    normalizeFilePathForComparison(activeDocument.filePath) ===
      normalizeFilePathForComparison(fullPathForRecentFile(recentFile)),
  );
};

const applyRecentFiles = (nextRecentFiles: readonly RecentFile[]): void => {
  recentFiles = nextRecentFiles.slice(0, MAXIMUM_RECENT_FILES);
  recentFilesLoadFailed = false;
  renderRecentFiles();
};

async function openRecentFile(recentFileId: string): Promise<void> {
  try {
    applyWorkspaceState(await window.desktop.openRecentFile(recentFileId));
  } catch {
    showNotice('The recent file could not be opened.');
  }
}

function renderRecentFiles(): void {
  const fragment = document.createDocumentFragment();

  for (const recentFile of recentFiles) {
    const item = window.document.createElement('li');
    const button = window.document.createElement('button');
    const name = window.document.createElement('span');
    const directory = window.document.createElement('span');
    const isActive = isActiveRecentFile(recentFile);

    item.className = 'recent-files-list__item';
    button.className = 'recent-file';
    button.type = 'button';
    button.title = fullPathForRecentFile(recentFile);
    button.setAttribute(
      'aria-label',
      `${recentFile.fileName}, ${recentFile.directoryPath}${isActive ? ', current file' : ''}`,
    );

    if (isActive) {
      button.setAttribute('aria-current', 'page');
    }

    name.className = 'recent-file__name';
    name.textContent = recentFile.fileName;
    directory.className = 'recent-file__directory';
    directory.textContent = abbreviatedDirectoryPath(recentFile.directoryPath);

    button.append(name, directory);
    button.addEventListener('click', () => {
      void openRecentFile(recentFile.id);
    });
    item.append(button);
    fragment.append(item);
  }

  recentFilesListElement.replaceChildren(fragment);
  recentFilesListElement.hidden = recentFiles.length === 0;
  recentFilesEmptyElement.hidden = recentFiles.length > 0;
  recentFilesEmptyElement.textContent = recentFilesLoadFailed
    ? 'Recent files could not be loaded.'
    : 'No recently edited files yet.';
}

const updateRecentFilesTogglePresentation = (): void => {
  const action = recentFilesVisible ? 'Hide' : 'Show';
  const shortcutLabel = shortcutPlatform === 'macos' ? '⌘\\' : 'Ctrl+\\';
  const ariaShortcut = shortcutPlatform === 'macos' ? 'Meta+\\' : 'Control+\\';

  toggleRecentFilesButton.setAttribute('aria-expanded', String(recentFilesVisible));
  toggleRecentFilesButton.setAttribute('aria-keyshortcuts', ariaShortcut);
  toggleRecentFilesButton.setAttribute('aria-label', `${action} recent files`);
  toggleRecentFilesButton.title = `${action} recent files (${shortcutLabel})`;
};

const setRecentFilesVisible = (isVisible: boolean): void => {
  const shouldRestoreFocus =
    !isVisible && recentFilesPaneElement.contains(window.document.activeElement);

  recentFilesVisible = isVisible;
  recentFilesPaneElement.hidden = !isVisible;
  document.body.classList.toggle('recent-files-visible', isVisible);
  updateRecentFilesTogglePresentation();

  if (shouldRestoreFocus) {
    toggleRecentFilesButton.focus({ preventScroll: true });
  }

  window.requestAnimationFrame(() => {
    editor?.layout();
  });
};

const toggleRecentFiles = (): void => {
  setRecentFilesVisible(!recentFilesVisible);
};

const isTabDirty = (tab: EditorTab): boolean => isDocumentDirty(tab.model, tab.savedSnapshot);

const saveViewState = (documentId: string | null): void => {
  if (!documentId || !editor) {
    return;
  }

  const tab = tabsByDocumentId.get(documentId);

  if (tab && editor.getModel() === tab.model) {
    tab.viewState = editor.saveViewState();
  }
};

const updateTabPresentation = (): void => {
  for (const [documentId, button] of tabButtonsByDocumentId) {
    updateTabPresentationForDocument(documentId, button);
  }
};

const updateTabPresentationForDocument = (
  documentId: string,
  button = tabButtonsByDocumentId.get(documentId),
): void => {
  if (!button) {
    return;
  }

  const tab = tabsByDocumentId.get(documentId);
  const document = documentForId(documentId);
  const isActive = documentId === workspaceState.activeDocumentId;
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
};

const activateTabLocally = (documentId: string, focusEditor = true): void => {
  const openedDocument = documentForId(documentId);

  if (!editor || !openedDocument) {
    return;
  }

  let tab = tabsByDocumentId.get(documentId);

  if (!tab) {
    tab = createTab(openedDocument);
    tabsByDocumentId.set(documentId, tab);
  }

  if (workspaceState.activeDocumentId !== documentId) {
    saveViewState(workspaceState.activeDocumentId);
  }

  workspaceState = {
    ...workspaceState,
    activeDocumentId: documentId,
  };

  editor.setModel(tab.model);

  if (tab.viewState) {
    editor.restoreViewState(tab.viewState);
  }

  document.title = `${openedDocument.fileName} — sign`;
  updateTabPresentation();
  renderRecentFiles();
  tabButtonsByDocumentId.get(documentId)?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });

  if (focusEditor) {
    editor.focus();
  }
};

const activateDocument = async (documentId: string): Promise<void> => {
  activateTabLocally(documentId);

  try {
    applyWorkspaceState(await window.desktop.activateDocument(documentId));
  } catch {
    showNotice('The selected tab could not be activated.');
  }
};

const languageForDocument = (document: OpenedDocument): string | null => {
  if (!monaco) {
    return null;
  }

  const fileName = document.fileName.toLowerCase();
  const language = monaco.languages.getLanguages().find((candidate) => {
    if (candidate.filenames?.some((name) => name.toLowerCase() === fileName)) {
      return true;
    }

    return candidate.extensions?.some((extension) => fileName.endsWith(extension.toLowerCase()));
  });

  return language?.id ?? null;
};

const updateModelLanguage = (document: OpenedDocument, tab: EditorTab): void => {
  if (!monaco) {
    return;
  }

  const language = languageForDocument(document);

  if (language && tab.model.getLanguageId() !== language) {
    monaco.editor.setModelLanguage(tab.model, language);
  }
};

const saveDocument = async (documentId: string, saveAs = false): Promise<boolean> => {
  if (!editor && documentForId(documentId)) {
    await ensureEditorRuntime();
  }

  const tab = tabsByDocumentId.get(documentId);

  if (!tab) {
    return false;
  }

  const snapshot = captureDocumentSnapshot(tab.model);

  try {
    const result = saveAs
      ? await window.desktop.saveDocumentAs(documentId, snapshot.contents)
      : await window.desktop.saveDocument(documentId, snapshot.contents);

    if (result.kind === 'cancelled') {
      return false;
    }

    if (result.kind === 'error') {
      showNotice(result.message);
      return false;
    }

    tab.savedSnapshot = snapshot;
    applyWorkspaceState(result.state);
    hideNotice();
    return true;
  } catch {
    showNotice('The document could not be saved.');
    return false;
  }
};

const saveActiveDocument = async (saveAs = false): Promise<void> => {
  if (workspaceState.activeDocumentId) {
    await saveDocument(workspaceState.activeDocumentId, saveAs);
  }
};

const closeDocument = async (documentId: string): Promise<void> => {
  const tab = tabsByDocumentId.get(documentId);
  const document = documentForId(documentId);

  if (!document) {
    return;
  }

  if (tab && isTabDirty(tab)) {
    let decision;

    try {
      decision = await window.desktop.confirmClose(documentId);
    } catch {
      showNotice('The close confirmation could not be shown.');
      return;
    }

    if (decision === 'cancel') {
      return;
    }

    if (decision === 'save') {
      if (!(await saveDocument(documentId))) {
        return;
      }

      const currentTab = tabsByDocumentId.get(documentId);

      if (currentTab && isTabDirty(currentTab)) {
        return;
      }
    }
  }

  try {
    applyWorkspaceState(await window.desktop.closeDocument(documentId));
  } catch {
    showNotice('The tab could not be closed.');
  }
};

const renderTabs = (): void => {
  const fragment = document.createDocumentFragment();
  tabButtonsByDocumentId.clear();

  for (const document of workspaceState.documents) {
    const tab = tabsByDocumentId.get(document.documentId);
    const tabItem = window.document.createElement('div');
    const selectButton = window.document.createElement('button');
    const fileName = window.document.createElement('span');
    const dirtyIndicator = window.document.createElement('span');
    const closeButton = window.document.createElement('button');

    tabItem.className = 'tab';
    tabItem.dataset['documentId'] = document.documentId;

    selectButton.className = 'tab__select';
    selectButton.type = 'button';
    selectButton.title = document.filePath ?? document.fileName;
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
        activateTabLocally(document.documentId, false);
      }
    });
    selectButton.addEventListener('click', () => {
      void activateDocument(document.documentId);
    });
    selectButton.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        void closeDocument(document.documentId);
      }
    });
    closeButton.addEventListener('click', () => {
      void closeDocument(document.documentId);
    });

    selectButton.append(dirtyIndicator, fileName);
    tabItem.append(selectButton, closeButton);
    fragment.append(tabItem);
    tabButtonsByDocumentId.set(document.documentId, selectButton);

    if (tab && isTabDirty(tab)) {
      tabItem.classList.add('tab--dirty');
    }
  }

  tabListElement.replaceChildren(fragment);
  updateTabPresentation();
};

const createTab = (document: OpenedDocument): EditorTab => {
  if (!monaco) {
    throw new Error('The editor runtime is not ready.');
  }

  const uri = monaco.Uri.from({
    authority: document.documentId,
    path: `/${document.fileName}`,
    scheme: 'sign-document',
  });
  const model = monaco.editor.createModel(document.contents, 'plaintext', uri);
  const savedSnapshot = captureDocumentSnapshot(model);
  const contentListener = model.onDidChangeContent(() => {
    updateTabPresentationForDocument(document.documentId);
  });

  const tab = {
    contentListener,
    model,
    savedSnapshot,
    viewState: null,
  };

  updateModelLanguage(document, tab);
  return tab;
};

const synchronizeEditorModels = (): void => {
  if (!editor || !monaco) {
    return;
  }

  const openDocumentIds = new Set(workspaceState.documents.map((document) => document.documentId));

  for (const document of workspaceState.documents) {
    const existingTab = tabsByDocumentId.get(document.documentId);

    if (existingTab) {
      updateModelLanguage(document, existingTab);
    } else if (document.documentId === workspaceState.activeDocumentId) {
      tabsByDocumentId.set(document.documentId, createTab(document));
    }
  }

  for (const [documentId, tab] of tabsByDocumentId) {
    if (openDocumentIds.has(documentId)) {
      continue;
    }

    if (editor.getModel() === tab.model) {
      editor.setModel(null);
    }

    tab.contentListener.dispose();
    tab.model.dispose();
    tabsByDocumentId.delete(documentId);
  }

  renderTabs();

  if (workspaceState.activeDocumentId && tabsByDocumentId.has(workspaceState.activeDocumentId)) {
    editor.layout();
    activateTabLocally(workspaceState.activeDocumentId);
  } else {
    editor.setModel(null);
  }
};

const ensureEditorRuntime = async (): Promise<void> => {
  if (editor) {
    return;
  }

  editorInitialization ??= (async () => {
    await import('./monaco-environment');
    const monacoApi = await import('monaco-editor');

    monaco = monacoApi;
    editor = monacoApi.editor.create(editorElement, {
      accessibilitySupport: 'auto',
      automaticLayout: true,
      bracketPairColorization: {
        enabled: false,
      },
      cursorBlinking: reducedMotion.matches ? 'solid' : 'blink',
      cursorSmoothCaretAnimation: 'off',
      fixedOverflowWidgets: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontLigatures: false,
      fontSize: 13,
      guides: {
        bracketPairs: false,
        indentation: true,
      },
      minimap: {
        enabled: false,
      },
      model: null,
      padding: {
        bottom: 12,
        top: 12,
      },
      renderWhitespace: 'selection',
      scrollBeyondLastLine: false,
      smoothScrolling: false,
      stickyScroll: {
        enabled: false,
      },
      theme: themeForPreferences(),
      wordWrap: wordWrapEnabled ? 'on' : 'off',
    });
    synchronizeEditorModels();
  })().catch(() => {
    editorInitialization = null;
    showNotice('The editor could not be loaded.');
  });

  await editorInitialization;
};

const applyWorkspaceState = (state: EditorWorkspaceState): void => {
  const wasEmpty = workspaceState.documents.length === 0;
  saveViewState(workspaceState.activeDocumentId);
  workspaceState = state;
  const isEmpty = state.documents.length === 0;

  renderTabs();
  renderRecentFiles();
  document.body.classList.toggle('workspace-empty', isEmpty);
  emptyWorkspaceElement.hidden = !isEmpty;
  editorElement.hidden = isEmpty;

  if (isEmpty) {
    synchronizeEditorModels();
    document.title = 'sign';

    if (!wasEmpty || document.activeElement === document.body) {
      createEmptyFileButton.focus({ preventScroll: true });
    }
  } else {
    const document = documentForId(state.activeDocumentId);

    if (document) {
      window.document.title = `${document.fileName} — sign`;
    }

    if (editor) {
      synchronizeEditorModels();
    } else {
      void ensureEditorRuntime();
    }
  }

  if (state.error) {
    showNotice(`${state.error.message} ${state.error.filePath}`);
  } else {
    hideNotice();
  }

  if (quickSwitcherElement.open) {
    renderQuickSwitcher();
  }
};

const openFiles = async (): Promise<void> => {
  try {
    applyWorkspaceState(await window.desktop.openFiles());
  } catch {
    showNotice('Files could not be opened.');
  }
};

const createDocument = async (): Promise<void> => {
  try {
    applyWorkspaceState(await window.desktop.createDocument());
  } catch {
    showNotice('A new document could not be created.');
  }
};

const reopenClosedDocument = async (): Promise<void> => {
  try {
    applyWorkspaceState(await window.desktop.reopenClosedDocument());
  } catch {
    showNotice('The closed tab could not be restored.');
  }
};

const quitApplicationIfEmpty = async (): Promise<void> => {
  try {
    if (!(await window.desktop.quitApplicationIfEmpty())) {
      showNotice('The application can only quit from an empty workspace.');
    }
  } catch {
    showNotice('The application could not be closed.');
  }
};

const activateRelativeTab = (offset: number): void => {
  const documentIds = workspaceState.documents.map((document) => document.documentId);

  if (documentIds.length === 0) {
    return;
  }

  const currentIndex = Math.max(0, documentIds.indexOf(workspaceState.activeDocumentId ?? ''));
  const nextIndex = (currentIndex + offset + documentIds.length) % documentIds.length;
  const nextDocumentId = documentIds[nextIndex];

  if (nextDocumentId) {
    void activateDocument(nextDocumentId);
  }
};

const activateDocumentAtIndex = (requestedIndex: number): void => {
  const index =
    requestedIndex === 8
      ? workspaceState.documents.length - 1
      : Math.min(requestedIndex, workspaceState.documents.length - 1);
  const document = workspaceState.documents[index];

  if (document) {
    void activateDocument(document.documentId);
  }
};

const updateQuickSwitcherSelection = (nextSelection: number): void => {
  const options =
    quickSwitcherResults.querySelectorAll<HTMLButtonElement>('.quick-switcher__option');

  if (options.length === 0) {
    quickSwitcherSelection = 0;
    return;
  }

  quickSwitcherSelection = (nextSelection + options.length) % options.length;

  for (const [index, option] of [...options].entries()) {
    const isSelected = index === quickSwitcherSelection;
    option.classList.toggle('quick-switcher__option--selected', isSelected);
    option.setAttribute('aria-selected', String(isSelected));

    if (isSelected) {
      option.scrollIntoView({ block: 'nearest' });
    }
  }
};

function renderQuickSwitcher(): void {
  const query = quickSwitcherInput.value.trim().toLowerCase();
  const matchingDocuments = workspaceState.documents.filter((document) => {
    const searchableText = `${document.fileName} ${document.filePath ?? ''}`.toLowerCase();
    return searchableText.includes(query);
  });
  const fragment = document.createDocumentFragment();

  quickSwitcherDocumentIds = matchingDocuments.map((document) => document.documentId);
  quickSwitcherSelection = 0;

  for (const [index, document] of matchingDocuments.entries()) {
    const option = window.document.createElement('button');
    const name = window.document.createElement('span');
    const path = window.document.createElement('span');

    option.className = 'quick-switcher__option';
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === 0));

    if (index === 0) {
      option.classList.add('quick-switcher__option--selected');
    }

    name.className = 'quick-switcher__name';
    name.textContent = document.fileName;
    path.className = 'quick-switcher__path';
    path.textContent = document.filePath ?? 'Unsaved file';

    option.append(name, path);
    option.addEventListener('pointermove', () => {
      updateQuickSwitcherSelection(index);
    });
    option.addEventListener('click', () => {
      quickSwitcherElement.close();
      void activateDocument(document.documentId);
    });
    fragment.append(option);
  }

  if (matchingDocuments.length === 0) {
    const emptyMessage = window.document.createElement('p');
    emptyMessage.className = 'quick-switcher__empty';
    emptyMessage.textContent = 'No matching open files';
    fragment.append(emptyMessage);
  }

  quickSwitcherResults.replaceChildren(fragment);
}

const openQuickSwitcher = (): void => {
  if (workspaceState.documents.length === 0) {
    return;
  }

  quickSwitcherInput.value = '';
  renderQuickSwitcher();

  if (!quickSwitcherElement.open) {
    quickSwitcherElement.showModal();
  }

  quickSwitcherInput.focus();
};

const toggleWordWrap = (): void => {
  wordWrapEnabled = !wordWrapEnabled;
  editor?.updateOptions({
    wordWrap: wordWrapEnabled ? 'on' : 'off',
  });
  editor?.focus();
};

const runEditorCommand = (command: EditorCommand): void => {
  if (command.startsWith('select-document-')) {
    const index = Number(command.at(-1)) - 1;
    activateDocumentAtIndex(index);
    return;
  }

  switch (command) {
    case 'close-active-document':
      if (workspaceState.activeDocumentId) {
        void closeDocument(workspaceState.activeDocumentId);
      } else {
        void quitApplicationIfEmpty();
      }
      break;
    case 'command-palette':
      void editor?.getAction('editor.action.quickCommand')?.run();
      break;
    case 'create-document':
      void createDocument();
      break;
    case 'next-document':
      activateRelativeTab(1);
      break;
    case 'open-files':
      void openFiles();
      break;
    case 'previous-document':
      activateRelativeTab(-1);
      break;
    case 'quick-switcher':
      openQuickSwitcher();
      break;
    case 'redo':
      editor?.trigger('application-menu', 'redo', null);
      break;
    case 'reopen-closed-document':
      void reopenClosedDocument();
      break;
    case 'save-document':
      void saveActiveDocument();
      break;
    case 'save-document-as':
      void saveActiveDocument(true);
      break;
    case 'toggle-recent-files':
      toggleRecentFiles();
      break;
    case 'toggle-word-wrap':
      toggleWordWrap();
      break;
    case 'undo':
      editor?.trigger('application-menu', 'undo', null);
      break;
  }
};

const updateTheme = (): void => {
  monaco?.editor.setTheme(themeForPreferences());
};

const updateMotionPreferences = (): void => {
  editor?.updateOptions({
    cursorBlinking: reducedMotion.matches ? 'solid' : 'blink',
  });
};

openFilesButton.addEventListener('click', () => {
  void openFiles();
});
toggleRecentFilesButton.addEventListener('click', toggleRecentFiles);
recentFilesPaneElement.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    setRecentFilesVisible(false);
  }
});
createEmptyFileButton.addEventListener('click', () => {
  void createDocument();
});
openEmptyFileButton.addEventListener('click', () => {
  void openFiles();
});
quickSwitcherInput.addEventListener('input', renderQuickSwitcher);
quickSwitcherInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    updateQuickSwitcherSelection(quickSwitcherSelection + (event.key === 'ArrowDown' ? 1 : -1));
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const documentId = quickSwitcherDocumentIds[quickSwitcherSelection];

    if (documentId) {
      quickSwitcherElement.close();
      void activateDocument(documentId);
    }
  }
});
quickSwitcherElement.addEventListener('click', (event) => {
  if (event.target === quickSwitcherElement) {
    quickSwitcherElement.close();
  }
});
window.addEventListener('keydown', (event) => {
  const command = resolveKeyboardShortcut(event, shortcutPlatform);

  if (command) {
    event.preventDefault();
    runEditorCommand(command);
  }
});
window.addEventListener(
  'dragenter',
  (event) => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    fileDragDepth += 1;
    setDropOverlayVisible(true);
  },
  true,
);
window.addEventListener(
  'dragover',
  (event) => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  },
  true,
);
window.addEventListener(
  'dragleave',
  (event) => {
    if (fileDragDepth === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    fileDragDepth -= 1;

    if (fileDragDepth === 0) {
      setDropOverlayVisible(false);
    }
  },
  true,
);
window.addEventListener(
  'drop',
  (event) => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    fileDragDepth = 0;
    setDropOverlayVisible(false);
    void openDroppedFiles([...event.dataTransfer.files]);
  },
  true,
);
window.addEventListener('blur', () => {
  fileDragDepth = 0;
  setDropOverlayVisible(false);
});

darkMode.addEventListener('change', updateTheme);
highContrast.addEventListener('change', updateTheme);
reducedMotion.addEventListener('change', updateMotionPreferences);

const disposeEditorCommandListener = window.desktop.onEditorCommand(runEditorCommand);
const disposeRecentFilesListener = window.desktop.onRecentFilesChanged(applyRecentFiles);
const disposeWorkspaceStateListener = window.desktop.onWorkspaceStateChanged(applyWorkspaceState);

const initializeEditor = async (): Promise<void> => {
  try {
    applyWorkspaceState(await window.desktop.getWorkspaceState());
  } catch {
    showNotice('The initial workspace state could not be loaded.');
  }
};

const initializeRecentFiles = async (): Promise<void> => {
  try {
    applyRecentFiles(await window.desktop.getRecentFiles());
  } catch {
    recentFilesLoadFailed = true;
    renderRecentFiles();
  }
};

updateRecentFilesTogglePresentation();
renderRecentFiles();

window.addEventListener('beforeunload', () => {
  disposeEditorCommandListener();
  disposeRecentFilesListener();
  disposeWorkspaceStateListener();
  darkMode.removeEventListener('change', updateTheme);
  highContrast.removeEventListener('change', updateTheme);
  reducedMotion.removeEventListener('change', updateMotionPreferences);

  editor?.dispose();

  for (const tab of tabsByDocumentId.values()) {
    tab.contentListener.dispose();
    tab.model.dispose();
  }
});

void initializeEditor();
void initializeRecentFiles();
