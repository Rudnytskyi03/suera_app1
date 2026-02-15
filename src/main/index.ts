import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { registerIpcHandlers } from './ipc';
import '../common/env';

const PRODUCT_NAME = 'Lingerie Brand Manager';

function configureUserDataPath() {
  const desiredUserDataPath = path.join(app.getPath('appData'), PRODUCT_NAME);
  if (app.getPath('userData') !== desiredUserDataPath) {
    app.setPath('userData', desiredUserDataPath);
  }

  fs.mkdirSync(desiredUserDataPath, { recursive: true });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: 'Lingerie Brand Manager',
    autoHideMenuBar: true,
    backgroundColor: '#f9fafb',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.setName(PRODUCT_NAME);

app.whenReady().then(() => {
  configureUserDataPath();

  electronApp.setAppUserModelId('com.lingerie.manager');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
