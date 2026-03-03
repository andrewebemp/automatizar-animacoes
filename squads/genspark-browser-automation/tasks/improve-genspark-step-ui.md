---
task: Improve GensparkStep UI
responsavel: "@ux-integrator"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: component_path
    tipo: string
    origem: Config
    obrigatorio: true
    validacao: "src/components/wizard-new/GensparkStep.tsx"

Saida:
  - campo: updated_component
    tipo: boolean
    destino: Build
    persistido: true
  - campo: changes_summary
    tipo: string[]
    destino: Changelog
    persistido: false

Checklist:
  - "[ ] Adicionar badge 'Nano Banana Pro - Gratuito' no painel Playwright"
  - "[ ] Auto-selecionar perfil Google detectado"
  - "[ ] Usar temp dir como pasta default (eliminar selecao obrigatoria)"
  - "[ ] Auto-importar imagens apos geracao completa"
  - "[ ] Mostrar status de conexao Chrome em tempo real"
  - "[ ] Adicionar indicador de modelo selecionado"
---

# Improve GensparkStep UI

## Purpose

Melhorar a UX do componente GensparkStep.tsx para reduzir friccao na geracao de imagens via Genspark. Foco em auto-configuracao, feedback visual do modelo gratuito, e simplificacao do fluxo.

## Key Changes

### 1. Model Badge in Playwright Panel

```typescript
// Add after the warning div in PlaywrightPanel
<div style={{
  backgroundColor: '#1a3320',
  border: '1px solid #22c55e',
  borderRadius: 8,
  padding: 12,
  marginBottom: 24,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}}>
  <span style={{ fontSize: 20 }}>🍌</span>
  <div>
    <span style={{ color: '#22c55e', fontWeight: 600 }}>Nano Banana Pro</span>
    <span style={{
      backgroundColor: '#22c55e',
      color: 'black',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      marginLeft: 8
    }}>GRATUITO</span>
    <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
      Usando sua conta Google (andrewebemp@gmail.com) - sem custos de API
    </p>
  </div>
</div>
```

### 2. Auto Output Folder

```typescript
// Use temp dir as default, auto-create
const [outputFolder, setOutputFolder] = useState<string>(() => {
  const tempDir = electronAPI?.getTempDir?.() ||
    path.join(os.tmpdir(), 'genspark-images', Date.now().toString());
  return tempDir;
});
```

### 3. Auto-Import on Complete

```typescript
useEffect(() => {
  if (status === 'completed' && generatedImages.length > 0) {
    // Auto-import after 2 seconds
    const timer = setTimeout(() => {
      onImagesGenerated(generatedImages);
    }, 2000);
    return () => clearTimeout(timer);
  }
}, [status, generatedImages]);
```

## Metadata

```yaml
version: 1.0.0
created: 2026-02-16
author: squad-creator
tags:
  - genspark-browser-automation
  - ui-improvement
  - react
```

---

*Task definition created by squad-creator*
