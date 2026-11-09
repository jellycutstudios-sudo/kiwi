const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Ensure only a single instance of POS runs on the terminal
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    title: 'DineOS Point of Sale',
    backgroundColor: '#0c0d11',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Maximize by default for touch screen terminals
  mainWindow.maximize();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (isDev && !process.env.ELECTRON_SERVE_DIST) {
    mainWindow.loadURL(devUrl).catch(() => {
      // Fallback to local dist if dev server is not running
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
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

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// IPC: Get connected system printers
ipcMain.handle('pos:get-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (e) {
    console.error('Failed to get printers:', e);
    return [];
  }
});

// IPC: Silent ESC/POS printing (no browser print dialog)
ipcMain.handle('pos:print-silent', async (event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No active window' };
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: true,
        printBackground: true,
        deviceName: options.printerName || '',
        margins: { marginType: 'none' },
        pageSize: options.pageSize || { width: 80000, height: 297000 }, // 80mm thermal receipt
      },
      (success, failureReason) => {
        if (!success) {
          resolve({ success: false, error: failureReason });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
});

// IPC: Toggle Fullscreen Kiosk Mode (prevents cashiers from closing POS)
ipcMain.handle('pos:toggle-kiosk', (event, enable) => {
  if (!mainWindow) return false;
  const current = mainWindow.isKiosk();
  const next = typeof enable === 'boolean' ? enable : !current;
  mainWindow.setKiosk(next);
  return next;
});

