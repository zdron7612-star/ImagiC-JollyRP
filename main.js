import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true
  });

  // Load the local server
  mainWindow.loadURL('http://localhost:3001');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  // Set up environment variables for the server BEFORE importing it
  process.env.DATA_DIR = app.getPath('userData');
  process.env.PORT = '3001';

  try {
    // Start the server directly within the Electron main process
    // This avoids the issue of spawning 'node' which can't read from inside an .asar archive!
    await import('./src/server.js');
    
    // Give the server a moment to start listening
    setTimeout(createWindow, 500);
  } catch (err) {
    console.error('Failed to start local server:', err);
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
