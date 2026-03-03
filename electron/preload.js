const { contextBridge, ipcRenderer } = require('electron');

// Expõe APIs seguras para o renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Diálogos de arquivo
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),

  // Operações de arquivo
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

  // Renderização de vídeo
  // Aceita tanto (projectData, outputPath) quanto ({ projectData, outputPath })
  renderVideo: (arg1, arg2) => {
    // Se arg1 é um objeto com projectData e outputPath, usa diretamente
    if (arg1 && typeof arg1 === 'object' && 'projectData' in arg1) {
      return ipcRenderer.invoke('render-video', arg1);
    }
    // Senão, assume que são argumentos separados
    return ipcRenderer.invoke('render-video', { projectData: arg1, outputPath: arg2 });
  },
  getRenderProgress: () => ipcRenderer.invoke('get-render-progress'),
  onRenderProgress: (callback) => {
    ipcRenderer.on('render-progress', (event, progress) => callback(progress));
  },
  removeRenderProgressListener: () => {
    ipcRenderer.removeAllListeners('render-progress');
  },

  // Exportação para editores de vídeo
  saveEditorProject: (options) => ipcRenderer.invoke('save-editor-project', options),

  // Informações do ambiente
  isElectron: true,
  platform: process.platform,

  // === Genspark - Playwright ===
  gensparkPlaywrightStart: (config) => ipcRenderer.invoke('genspark-playwright-start', config),
  gensparkPlaywrightCancel: () => ipcRenderer.invoke('genspark-playwright-cancel'),
  gensparkPlaywrightIsRunning: () => ipcRenderer.invoke('genspark-playwright-is-running'),
  getChromeProfiles: () => ipcRenderer.invoke('genspark-get-chrome-profiles'),

  // === Genspark - Extensão (Folder Watcher) ===
  gensparkExportPrompts: (data) => ipcRenderer.invoke('genspark-export-prompts', data),
  gensparkWatchFolder: (folderPath) => ipcRenderer.invoke('genspark-watch-folder', folderPath),
  gensparkStopWatch: () => ipcRenderer.invoke('genspark-stop-watch'),
  gensparkGetFolderImages: (folderPath) => ipcRenderer.invoke('genspark-get-folder-images', folderPath),
  gensparkFolderExists: (folderPath) => ipcRenderer.invoke('genspark-folder-exists', folderPath),
  gensparkEnsureFolder: (folderPath) => ipcRenderer.invoke('genspark-ensure-folder', folderPath),
  gensparkSelectFolder: () => ipcRenderer.invoke('genspark-select-folder'),

  // === Genspark - Eventos ===
  onGensparkProgress: (callback) => {
    ipcRenderer.on('genspark-progress', (event, data) => callback(data));
  },
  onGensparkImageGenerated: (callback) => {
    ipcRenderer.on('genspark-image-generated', (event, data) => callback(data));
  },
  onGensparkError: (callback) => {
    ipcRenderer.on('genspark-error', (event, data) => callback(data));
  },
  onGensparkImageDetected: (callback) => {
    ipcRenderer.on('genspark-image-detected', (event, data) => callback(data));
  },
  onGensparkWatchError: (callback) => {
    ipcRenderer.on('genspark-watch-error', (event, data) => callback(data));
  },
  removeGensparkListeners: () => {
    ipcRenderer.removeAllListeners('genspark-progress');
    ipcRenderer.removeAllListeners('genspark-image-generated');
    ipcRenderer.removeAllListeners('genspark-error');
    ipcRenderer.removeAllListeners('genspark-image-detected');
    ipcRenderer.removeAllListeners('genspark-watch-error');
  },
});
