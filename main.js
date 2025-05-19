const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // Needed to allow loading local files
    },
  });

  // Check if preload.js exists, if not create it
  const preloadPath = path.join(__dirname, 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    const preloadContent = `const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', 
  {
    send: (channel, data) => {
      // whitelist channels
      let validChannels = ['open-file-dialog'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    receive: (channel, func) => {
      let validChannels = ['selected-files'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes 'sender' 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    invoke: (channel, ...args) => {
      let validChannels = ['read-file', 'get-file-info'];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error('Invalid channel: ' + channel));
    }
  }
);`;
    fs.writeFileSync(preloadPath, preloadContent);
    console.log('Created missing preload.js file');
  }

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Open DevTools for debugging
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle file dialog
ipcMain.on('open-file-dialog', (event) => {
  dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'webm', 'ogg', 'mkv', 'avi', 'mov'] }
    ]
  }).then(result => {
    if (!result.canceled) {
      event.reply('selected-files', result.filePaths);
    }
  }).catch(err => {
    console.error(err);
  });
});

// Read file content
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer.toString('base64');
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
});

// Get file info
ipcMain.handle('get-file-info', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      name: path.basename(filePath)
    };
  } catch (error) {
    console.error('Error getting file info:', error);
    return null;
  }
});