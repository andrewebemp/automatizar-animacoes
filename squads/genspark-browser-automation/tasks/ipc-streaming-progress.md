---
task: IPC Streaming Progress
responsavel: "@ipc-architect"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: current_ipc_handlers
    tipo: string[]
    origem: electron/main.js
    obrigatorio: true
    validacao: "Lista de IPC handlers existentes"

Saida:
  - campo: updated_handlers
    tipo: string[]
    destino: Documentation
    persistido: false
  - campo: event_types
    tipo: string[]
    destino: Frontend listeners
    persistido: false

Checklist:
  - "[ ] Mapear IPC handlers existentes em main.js"
  - "[ ] Substituir polling por webContents.send() para progresso"
  - "[ ] Implementar canais bidirecionais para controle"
  - "[ ] Atualizar listeners no GensparkStep.tsx"
  - "[ ] Testar streaming com geracao real"
---

# IPC Streaming Progress

## Purpose

Substituir o modelo atual de comunicacao (callbacks via electronAPI) por streaming bidirecional via IPC, permitindo progresso em tempo real sem polling.

## Event Channel Map

```typescript
// === Main → Renderer (streaming events) ===

// Progress updates durante geracao
'genspark:progress' → {
  status: 'generating' | 'waiting' | 'rate_limited' | 'retrying',
  current: number,
  total: number,
  message: string,
  eta_ms?: number
}

// Imagem gerada
'genspark:image-ready' → {
  index: number,
  dataUrl: string,  // base64 da imagem
  prompt: string,
  generation_time_ms: number
}

// Erro
'genspark:error' → {
  code: string,
  message: string,
  recoverable: boolean
}

// Status de conexao Chrome
'genspark:connection-status' → {
  status: 'connected' | 'disconnected' | 'reconnecting' | 'failed',
  method: 'cdp-connect' | 'profile-launch' | 'app-profile',
  profile_name?: string
}

// Info do modelo
'genspark:model-info' → {
  name: string,  // 'Nano Banana Pro'
  is_free: boolean,
  selected: boolean
}

// === Renderer → Main (invoke commands) ===

'genspark:start-generation' → { prompts: string[], aspectRatio: string }
'genspark:cancel' → {}
'genspark:connect' → { email?: string }
'genspark:get-profiles' → {} → ChromeProfile[]
```

## Implementation in main.js

```javascript
// Replace callback-based progress with IPC streaming
function startGeneration(event, config) {
  const { prompts, aspectRatio } = config;
  const sender = event.sender; // webContents

  generateImages({
    ...config,
    onProgress: (data) => sender.send('genspark:progress', data),
    onImageGenerated: (data) => sender.send('genspark:image-ready', data),
    onError: (data) => sender.send('genspark:error', data),
    onRateLimited: (data) => sender.send('genspark:progress', {
      ...data, status: 'rate_limited'
    }),
  });
}

ipcMain.handle('genspark:start-generation', startGeneration);
```

## Frontend Listener Updates

```typescript
// In GensparkStep.tsx - replace electronAPI callbacks with ipcRenderer
useEffect(() => {
  const { ipcRenderer } = window.require('electron');

  const handlers = {
    'genspark:progress': (_e, data) => { setProgress(data); setStatus(data.status); },
    'genspark:image-ready': (_e, data) => { setGeneratedImages(prev => [...prev, data]); },
    'genspark:error': (_e, data) => { setError(data.message); },
    'genspark:connection-status': (_e, data) => { setConnectionStatus(data); },
    'genspark:model-info': (_e, data) => { setModelInfo(data); },
  };

  Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.on(ch, fn));
  return () => {
    Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.removeListener(ch, fn));
  };
}, []);
```

## Metadata

```yaml
version: 1.0.0
created: 2026-02-16
author: squad-creator
tags:
  - genspark-browser-automation
  - ipc-streaming
  - electron
```

---

*Task definition created by squad-creator*
