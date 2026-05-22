const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;
let timerInterval;
let currentSeconds = 0;
let isRunning = false;
let isCompact = false;

// ── 托盘图标：三道水波纹（简洁 template image，macOS 深/浅色均可用）──
const TRAY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <path d="M6 16 Q13 10 20 16 Q27 22 34 16 Q38 13 42 16" stroke="black" stroke-width="3"   stroke-linecap="round" fill="none"/>
  <path d="M6 24 Q13 18 20 24 Q27 30 34 24 Q38 21 42 24" stroke="black" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M6 32 Q13 26 20 32 Q27 38 34 32 Q38 29 42 32" stroke="black" stroke-width="2"   stroke-linecap="round" fill="none"/>
</svg>`;

function makeTrayIcon() {
  const b64 = Buffer.from(TRAY_ICON_SVG).toString('base64');
  const img = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${b64}`);
  img.setTemplateImage(true);   // macOS 自动适配深色/浅色菜单栏
  return img;
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // macOS 保留托盘，不退出
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow.show();
});

// ── 主窗口 ──
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 340,
    height: 500,
    minWidth: 280,
    minHeight: 420,
    maxWidth: 520,
    maxHeight: 700,
    x: width - 360,
    y: 60,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

// ── 系统托盘 ──
function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setTitle(' ≈');
  tray.setToolTip('Chan zone');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => app.exit(0) },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── IPC：接收渲染进程的计时器状态 ──
ipcMain.on('timer-tick', (_, { remaining, running, label }) => {
  if (!tray) return;
  if (running && remaining > 0) {
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    tray.setTitle(` ${m}:${s}`);
  } else {
    tray.setTitle(' ≈');   // 空闲时显示水波纹符号，保持 tray item 可见
  }
});

ipcMain.on('window-compact-toggle', () => {
  if (!mainWindow) return;
  isCompact = !isCompact;

  if (isCompact) {
    // Flow 风格迷你窗口
    mainWindow.setMinimumSize(240, 300);
    mainWindow.setMaximumSize(380, 520);
    setTimeout(() => mainWindow?.setSize(280, 360, true), 60);
  } else {
    // 恢复正常
    mainWindow.setMinimumSize(280, 420);
    mainWindow.setMaximumSize(520, 700);
    mainWindow.setSize(340, 500, true);
  }

  mainWindow.webContents.send('window-compact-changed', isCompact);
});

// ── IPC：写入苹果日历（.ics 方案，无需权限）──
ipcMain.handle('add-to-calendar', async (_, { title, startISO, endISO }) => {
  try {
    // 格式化为 ICS 时间戳：20250520T143000
    const fmtICS = (iso) => {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}` +
             `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    };

    const uid = `chanzone-${Date.now()}@local`;
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${fmtICS(startISO)}`,
      `DTEND:${fmtICS(endISO)}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:由 Chan zone 记录`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const tmpPath = path.join(app.getPath('temp'), `chanzone-${Date.now()}.ics`);
    fs.writeFileSync(tmpPath, ics, 'utf8');
    await shell.openPath(tmpPath);   // 系统弹出"加入日历"确认框
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── IPC：窗口控制 ──
ipcMain.on('window-close',    () => mainWindow.hide());
ipcMain.on('window-minimize', () => mainWindow.minimize());
