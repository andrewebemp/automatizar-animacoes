import React from 'react';
import { createRoot } from 'react-dom/client';
import { EditorApp } from '../src/components/editor/EditorApp';

// Handler global de erros para capturar erros que escapam do React
function showGlobalError(message: string, stack?: string) {
  // Remove qualquer conteúdo anterior
  document.body.innerHTML = '';

  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background-color: #0f0f1a;
    color: white;
    padding: 32px;
    text-align: center;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  errorDiv.innerHTML = `
    <div style="font-size: 64px; margin-bottom: 24px;">🔥</div>
    <h1 style="color: #ef4444; margin-bottom: 16px;">Erro Fatal</h1>
    <p style="color: #a0a0b0; margin-bottom: 24px; max-width: 600px;">
      Ocorreu um erro antes do React inicializar. Isso pode indicar um problema de importação ou dados corrompidos.
    </p>
    <div style="background-color: #1a1a2e; padding: 16px; border-radius: 8px; margin-bottom: 24px; max-width: 90%; max-height: 300px; overflow: auto; text-align: left;">
      <div style="color: #ef4444; font-weight: bold; margin-bottom: 8px;">Mensagem:</div>
      <pre style="color: #fbbf24; font-size: 12px; white-space: pre-wrap; word-break: break-word;">${message}</pre>
      ${stack ? `
        <div style="color: #ef4444; font-weight: bold; margin-top: 16px; margin-bottom: 8px;">Stack:</div>
        <pre style="color: #6a6a8e; font-size: 10px; white-space: pre-wrap; word-break: break-word;">${stack}</pre>
      ` : ''}
    </div>
    <div style="display: flex; gap: 16px;">
      <button onclick="localStorage.clear(); indexedDB.deleteDatabase('automatizar-animacoes-wizard-db'); window.location.reload();"
        style="padding: 12px 24px; background-color: #ef4444; border: none; border-radius: 8px; color: white; cursor: pointer; font-size: 14px;">
        Limpar Dados e Reiniciar
      </button>
      <button onclick="window.location.reload();"
        style="padding: 12px 24px; background-color: #3b82f6; border: none; border-radius: 8px; color: white; cursor: pointer; font-size: 14px;">
        Recarregar
      </button>
    </div>
  `;

  document.body.appendChild(errorDiv);
}

// Captura erros não tratados
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global Error]', message, source, lineno, colno, error);
  showGlobalError(
    `${message}\n\nArquivo: ${source}\nLinha: ${lineno}, Coluna: ${colno}`,
    error?.stack
  );
  return true;
};

// Captura promessas rejeitadas não tratadas
window.onunhandledrejection = (event) => {
  console.error('[Unhandled Rejection]', event.reason);
  showGlobalError(
    `Promise rejeitada: ${event.reason?.message || event.reason}`,
    event.reason?.stack
  );
};

try {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element not found');
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <EditorApp />
    </React.StrictMode>
  );
} catch (error) {
  console.error('[Init Error]', error);
  showGlobalError(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined
  );
}
