---
task: Chrome Session Manager
responsavel: "@ipc-architect"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: electron_main_path
    tipo: string
    origem: Config
    obrigatorio: true
    validacao: "electron/main.js"

Saida:
  - campo: manager_module_path
    tipo: string
    destino: Require in main.js
    persistido: true
  - campo: ipc_handlers_registered
    tipo: string[]
    destino: Documentation
    persistido: false

Checklist:
  - "[ ] Criar modulo electron/chromeSessionManager.js"
  - "[ ] Implementar detectRunningChrome()"
  - "[ ] Implementar connectViaCDP()"
  - "[ ] Implementar launchWithProfile()"
  - "[ ] Implementar getSession() e dispose()"
  - "[ ] Implementar onDisconnect() com auto-reconnect"
  - "[ ] Registrar IPC handlers em main.js"
  - "[ ] Extrair logica de sessao de gensparkPlaywright.js"
---

# Chrome Session Manager

## Purpose

Criar um modulo centralizado no Electron main process que gerencia o lifecycle completo da sessao Chrome: deteccao, conexao via CDP, lancamento com perfil, e recovery automatico.

## Module Structure

```javascript
// electron/chromeSessionManager.js

class ChromeSessionManager {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cdpSession = null;
    this.connectionMethod = null; // 'cdp-connect' | 'profile-launch' | 'app-profile'
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.onDisconnectCallbacks = [];
    this.onStatusChangeCallbacks = [];
  }

  // === Connection Methods ===

  async connect(options = {}) {
    const { email = 'andrewebemp@gmail.com', profilePath, profileDir } = options;

    // Try CDP connect first
    const running = await this.detectRunningChrome();
    if (running) {
      await this.connectViaCDP(running.wsEndpoint);
      return;
    }

    // Try user profile
    if (email) {
      const profile = this.findProfileByEmail(email);
      if (profile) {
        await this.launchWithProfile(profile);
        return;
      }
    }

    // Fallback: app profile
    await this.launchWithAppProfile();
  }

  async detectRunningChrome() { /* ... */ }
  async connectViaCDP(wsEndpoint) { /* ... */ }
  async launchWithProfile(profile) { /* ... */ }
  async launchWithAppProfile() { /* ... */ }

  // === Session Access ===

  getSession() {
    return { browser: this.browser, page: this.page, cdp: this.cdpSession };
  }

  isActive() {
    return this.isConnected && this.browser?.isConnected();
  }

  // === Recovery ===

  async handleDisconnect() {
    this.isConnected = false;
    this.notifyStatusChange('disconnected');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.notifyStatusChange('reconnecting');
      try {
        await this.connect();
        this.reconnectAttempts = 0;
      } catch (e) {
        this.notifyStatusChange('failed');
      }
    }
  }

  // === Lifecycle ===

  async dispose() {
    if (this.browser) {
      try { await this.browser.close(); } catch (e) {}
    }
    this.browser = null;
    this.page = null;
    this.cdpSession = null;
    this.isConnected = false;
  }

  // === Events ===

  onDisconnect(callback) { this.onDisconnectCallbacks.push(callback); }
  onStatusChange(callback) { this.onStatusChangeCallbacks.push(callback); }
}

module.exports = { ChromeSessionManager };
```

## IPC Registration in main.js

```javascript
const { ChromeSessionManager } = require('./chromeSessionManager');
const sessionManager = new ChromeSessionManager();

// Register IPC handlers
ipcMain.handle('genspark:connect', async (event, options) => {
  await sessionManager.connect(options);
  return { connected: sessionManager.isActive() };
});

ipcMain.handle('genspark:get-status', () => ({
  connected: sessionManager.isActive(),
  method: sessionManager.connectionMethod
}));

ipcMain.handle('genspark:disconnect', () => sessionManager.dispose());

// Forward status changes to renderer
sessionManager.onStatusChange((status) => {
  mainWindow?.webContents.send('genspark:connection-status', status);
});
```

## Metadata

```yaml
version: 1.0.0
created: 2026-02-16
author: squad-creator
tags:
  - genspark-browser-automation
  - chrome-session
  - electron-ipc
```

---

*Task definition created by squad-creator*
