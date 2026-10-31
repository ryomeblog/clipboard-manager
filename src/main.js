const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  clipboard,
  ipcMain,
  nativeImage,
  screen,
  systemPreferences,
  dialog,
} = require('electron');
const path = require('path');
const { HistoryStore } = require('./store');
const { startDoubleTapListener } = require('./doubleTap');

const POLL_INTERVAL_MS = 500;
const WINDOW_WIDTH = 420;
const WINDOW_HEIGHT = 480;

let store;
let tray;
let popup;
let lastClipboardText = '';
let polling = false;
let stopListener;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createPopup() {
  popup = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popup.setAlwaysOnTop(true, 'pop-up-menu');
  popup.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  popup.on('blur', () => hidePopup(false));
}

// マウスカーソル付近に表示（画面外にはみ出さないように調整）
function positionNearCursor() {
  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  let x = cursor.x + 8;
  let y = cursor.y + 8;
  if (x + WINDOW_WIDTH > workArea.x + workArea.width) x = cursor.x - WINDOW_WIDTH - 8;
  if (y + WINDOW_HEIGHT > workArea.y + workArea.height) y = cursor.y - WINDOW_HEIGHT - 8;
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - WINDOW_WIDTH));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - WINDOW_HEIGHT));
  popup.setPosition(Math.round(x), Math.round(y));
}

function showPopup() {
  if (!popup) return;
  if (popup.isVisible()) {
    hidePopup(true);
    return;
  }
  positionNearCursor();
  popup.webContents.send('history:update', store.list());
  popup.webContents.send('popup:shown');
  popup.show();
  app.focus({ steal: true });
  popup.focus();
}

// returnFocus: 直前のアプリにフォーカスを戻す
function hidePopup(returnFocus) {
  if (!popup || !popup.isVisible()) return;
  popup.hide();
  if (returnFocus) app.hide();
}

// readText() は Promise を返すので、前回の読み取りが終わるまで次を始めない
async function pollClipboard() {
  if (polling) return;
  polling = true;
  try {
    const text = await clipboard.readText();
    if (typeof text !== 'string' || text === lastClipboardText) return;
    lastClipboardText = text;
    if (store.add(text)) broadcastHistory();
  } catch (err) {
    console.error('clipboard read failed:', err);
  } finally {
    polling = false;
  }
}

function broadcastHistory() {
  if (popup && popup.isVisible()) popup.webContents.send('history:update', store.list());
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '履歴を開く  (⌘ を2回押す)', click: showPopup },
    { type: 'separator' },
    {
      label: 'ピン留め以外の履歴をクリア',
      click: () => {
        store.clearUnpinned();
        broadcastHistory();
      },
    },
    {
      label: 'ログイン時に起動',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: '終了', role: 'quit' },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('📋');
  tray.setToolTip('Clipboard Manager');
  tray.on('click', () => tray.popUpContextMenu(buildTrayMenu()));
  tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()));
}

function ensureAccessibility() {
  if (systemPreferences.isTrustedAccessibilityClient(false)) return true;
  dialog
    .showMessageBox({
      type: 'info',
      message: 'アクセシビリティの許可が必要です',
      detail:
        '⌘キーの2回押しを検出するために、「システム設定 > プライバシーとセキュリティ > アクセシビリティ」で Clipboard Manager を許可してください。\n\n許可した後、アプリを再起動してください。',
    })
    .then(() => systemPreferences.isTrustedAccessibilityClient(true));
  return false;
}

ipcMain.handle('history:get', () => store.list());

ipcMain.on('item:select', async (_e, id) => {
  const item = store.get(id);
  if (!item) return;
  lastClipboardText = item.text;
  await clipboard.writeText(item.text);
  store.add(item.text);
  hidePopup(true);
});

ipcMain.on('item:togglePin', (_e, id) => {
  store.togglePin(id);
  broadcastHistory();
});

ipcMain.on('item:remove', (_e, id) => {
  store.remove(id);
  broadcastHistory();
});

ipcMain.on('popup:hide', () => hidePopup(true));

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide();

  store = new HistoryStore(app.getPath('userData'));
  try {
    lastClipboardText = await clipboard.readText();
  } catch {
    lastClipboardText = '';
  }

  createPopup();
  createTray();
  setInterval(pollClipboard, POLL_INTERVAL_MS);

  if (ensureAccessibility()) {
    stopListener = startDoubleTapListener(showPopup);
  }
});

app.on('second-instance', showPopup);

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', () => {
  if (stopListener) stopListener();
  if (store) store.flush();
});
