const { app, BrowserWindow, shell, dialog, ipcMain, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

function resolveHtmlPath() {
  return path.join(app.getAppPath(), '日程.HTML');
}

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function sanitizeSuggestedName(name, fallback) {
  const s = String(name || '').trim();
  const base = s || String(fallback || '').trim() || 'starwork-backup.json';
  return base.replace(/[\\\/:\*\?"<>\|]/g, '_');
}

function createStaticServer() {
  const htmlPath = resolveHtmlPath();
  const server = http.createServer((req, res) => {
    const reqUrl = url.parse(req.url || '').pathname || '/';
    if (reqUrl === '/' || decodeURIComponent(reqUrl) === '/日程.HTML') {
      fs.readFile(htmlPath, (err, buf) => {
        if (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(String(err && err.message ? err.message : err));
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(buf);
      });
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') return reject(new Error('Invalid server address'));
      resolve({ server, port: addr.port });
    });
  });
}

function createMainWindow(loadUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });

  win.loadURL(loadUrl);
  return win;
}

function buildMenu(win, onCheckUpdates) {
  const template = [
    {
      label: 'StarWork',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: '文件',
      submenu: [
        {
          label: '导出备份…',
          click: () => {
            try { win.webContents.send('starwork:updateStatus', { type: 'hint', text: 'open-settings-backup-export' }); } catch {}
          }
        },
        {
          label: '导入备份…',
          click: () => {
            try { win.webContents.send('starwork:updateStatus', { type: 'hint', text: 'open-settings-backup-import' }); } catch {}
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '检查更新…',
          click: async () => {
            try {
              if (typeof onCheckUpdates === 'function') await onCheckUpdates();
              else await dialog.showMessageBox(win, { type: 'info', message: '当前构建不支持自动更新。' });
            } catch {}
            try { win.webContents.send('starwork:updateStatus', { type: 'hint', text: 'check-updates' }); } catch {}
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createAutoUpdater(win) {
  let autoUpdater = null;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch {
    return null;
  }

  const configPath = path.join(process.resourcesPath || '', 'app-update.yml');
  const canUpdate = app.isPackaged && fs.existsSync(configPath);
  if (!canUpdate) return null;

  const send = (payload) => {
    try { win.webContents.send('starwork:updateStatus', payload); } catch {}
  };

  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => send({ type: 'checking' }));
  autoUpdater.on('update-available', async (info) => {
    send({ type: 'available', info });
    try {
      const r = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['下载并安装', '稍后'],
        defaultId: 0,
        cancelId: 1,
        message: '发现新版本，是否下载更新？'
      });
      if (r && r.response === 0) autoUpdater.downloadUpdate();
    } catch {}
  });
  autoUpdater.on('update-not-available', (info) => send({ type: 'none', info }));
  autoUpdater.on('error', (err) => send({ type: 'error', message: String(err && err.message ? err.message : err) }));
  autoUpdater.on('download-progress', (p) => send({ type: 'progress', percent: Number(p && p.percent != null ? p.percent : 0) }));
  autoUpdater.on('update-downloaded', async () => {
    send({ type: 'downloaded' });
    try {
      const r = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
        cancelId: 1,
        message: '更新已下载完成，是否立即重启安装？'
      });
      if (r && r.response === 0) autoUpdater.quitAndInstall();
    } catch {}
  });

  return autoUpdater;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let serverRef = null;
  let winRef = null;
  let autoUpdaterRef = null;

  app.on('second-instance', () => {
    if (winRef) {
      if (winRef.isMinimized()) winRef.restore();
      winRef.focus();
    }
  });

  app.whenReady().then(async () => {
    const { server, port } = await createStaticServer();
    serverRef = server;
    winRef = createMainWindow(`http://127.0.0.1:${port}/`);
    autoUpdaterRef = createAutoUpdater(winRef);
    buildMenu(winRef, async () => {
      if (!autoUpdaterRef) {
        await dialog.showMessageBox(winRef, { type: 'info', message: '当前构建不支持自动更新。' });
        return;
      }
      await autoUpdaterRef.checkForUpdates();
    });

    ipcMain.handle('starwork:openTextFile', async (_evt, options) => {
      const win = winRef;
      if (!win) return { canceled: true };
      const ext = Array.isArray(options && options.extensions) ? options.extensions.filter(Boolean) : ['json'];
      const title = String(options && options.title ? options.title : '');
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: title || undefined,
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ext }]
      });
      if (canceled || !filePaths || !filePaths[0]) return { canceled: true };
      const p = filePaths[0];
      const content = await fs.promises.readFile(p, 'utf-8');
      return { canceled: false, path: p, content };
    });

    ipcMain.handle('starwork:saveTextFile', async (_evt, options) => {
      const win = winRef;
      if (!win) return { canceled: true };
      const content = String(options && options.content != null ? options.content : '');
      const suggestedName = sanitizeSuggestedName(options && options.suggestedName, 'starwork-backup.json');
      const title = String(options && options.title ? options.title : '');
      const ext = Array.isArray(options && options.extensions) ? options.extensions.filter(Boolean) : ['json'];
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: title || undefined,
        defaultPath: suggestedName,
        filters: [{ name: 'JSON', extensions: ext }]
      });
      if (canceled || !filePath) return { canceled: true };
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return { canceled: false, path: filePath };
    });

    ipcMain.handle('starwork:autoBackup', async (_evt, options) => {
      const content = String(options && options.content != null ? options.content : '');
      const baseName = sanitizeSuggestedName(options && options.suggestedName, 'starwork-autobackup.json');
      const dir = path.join(app.getPath('userData'), 'backups');
      if (!ensureDir(dir)) return { ok: false };
      const filePath = path.join(dir, baseName);
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return { ok: true, path: filePath };
    });

    ipcMain.handle('starwork:checkForUpdates', async () => {
      if (!autoUpdaterRef) return { ok: false, reason: 'unsupported' };
      try {
        await autoUpdaterRef.checkForUpdates();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        winRef = createMainWindow(`http://127.0.0.1:${port}/`);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    try {
      if (serverRef) serverRef.close();
    } catch {}
  });
}
