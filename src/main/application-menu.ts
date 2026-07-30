import { app, Menu } from 'electron';

import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import type { EditorCommand } from '../shared/desktop-api';

import { IPC_CHANNELS } from '../shared/desktop-api';

const commandItem = (
  label: string,
  accelerator: string,
  command: EditorCommand,
  mainWindow: () => BrowserWindow | null,
): MenuItemConstructorOptions => ({
  accelerator,
  click: () => {
    const window = mainWindow();

    if (window && !window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.editorCommand, command);
    }
  },
  label,
});

export const installApplicationMenu = (mainWindow: () => BrowserWindow | null): void => {
  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      commandItem('New File', 'CmdOrCtrl+N', 'create-document', mainWindow),
      commandItem('Open Files…', 'CmdOrCtrl+O', 'open-files', mainWindow),
      { type: 'separator' },
      commandItem('Save', 'CmdOrCtrl+S', 'save-document', mainWindow),
      commandItem('Save As…', 'CmdOrCtrl+Shift+S', 'save-document-as', mainWindow),
      { type: 'separator' },
      commandItem(
        'Reopen Closed Editor',
        'CmdOrCtrl+Shift+T',
        'reopen-closed-document',
        mainWindow,
      ),
      commandItem('Close Editor', 'CmdOrCtrl+W', 'close-active-document', mainWindow),
    ],
  };
  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      commandItem('Undo', 'CmdOrCtrl+Z', 'undo', mainWindow),
      commandItem(
        'Redo',
        process.platform === 'darwin' ? 'CmdOrCtrl+Shift+Z' : 'Ctrl+Y',
        'redo',
        mainWindow,
      ),
      { type: 'separator' },
      { label: 'Cut', role: 'cut' },
      { label: 'Copy', role: 'copy' },
      { label: 'Paste', role: 'paste' },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll' },
    ],
  };
  const focusEditorItems = Array.from({ length: 9 }, (_, index) =>
    commandItem(
      index === 8 ? 'Last Editor' : `Editor ${index + 1}`,
      `CmdOrCtrl+${index + 1}`,
      `select-document-${index + 1}` as EditorCommand,
      mainWindow,
    ),
  );
  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      commandItem('Quick Switcher…', 'CmdOrCtrl+P', 'quick-switcher', mainWindow),
      commandItem('Command Palette…', 'CmdOrCtrl+Shift+P', 'command-palette', mainWindow),
      { type: 'separator' },
      commandItem('Next Editor', 'Ctrl+Tab', 'next-document', mainWindow),
      commandItem('Previous Editor', 'Ctrl+Shift+Tab', 'previous-document', mainWindow),
      {
        label: 'Focus Editor',
        submenu: focusEditorItems,
      },
      { type: 'separator' },
      commandItem('Toggle Word Wrap', 'Alt+Z', 'toggle-word-wrap', mainWindow),
      { type: 'separator' },
      { label: 'Reset Zoom', role: 'resetZoom' },
      { label: 'Zoom In', role: 'zoomIn' },
      { label: 'Zoom Out', role: 'zoomOut' },
      { type: 'separator' },
      { label: 'Toggle Full Screen', role: 'togglefullscreen' },
    ],
  };
  const windowMenu: MenuItemConstructorOptions = {
    label: 'Window',
    role: 'windowMenu',
  };
  const template: MenuItemConstructorOptions[] = [fileMenu, editMenu, viewMenu, windowMenu];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
