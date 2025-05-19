const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', 
  {
    send: (channel, data) => {
      // Whitelist channels
      let validChannels = ['open-file-dialog'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    receive: (channel, func) => {
      let validChannels = ['selected-files'];
      if (validChannels.includes(channel)) {
        // Remove the event to avoid memory leaks
        ipcRenderer.removeAllListeners(channel);
        // Add a new listener
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    invoke: (channel, ...args) => {
      let validChannels = ['read-file', 'get-file-info'];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error(`Invalid channel: ${channel}`));
    }
  }
);