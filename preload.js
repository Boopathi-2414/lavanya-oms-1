const { contextBridge } = require('electron');

// Expose safe APIs to the renderer here if needed later (e.g. for Supabase config).
// The app currently uses localStorage, so no IPC bridge is required.
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
