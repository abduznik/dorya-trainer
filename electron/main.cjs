// Minimal Electron wrapper. Install once with:  npm i -D electron electron-builder
// Then: npm run build && npm run desktop     (or npm run dist:win for an installer)
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720, backgroundColor: '#0e1016', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
