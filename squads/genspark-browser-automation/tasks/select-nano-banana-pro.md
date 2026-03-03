---
task: Select Nano Banana Pro Model
responsavel: "@browser-engineer"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: page_session
    tipo: object
    origem: ChromeSessionManager
    obrigatorio: true
    validacao: "Puppeteer Page na pagina do Genspark image generator"

Saida:
  - campo: model_selected
    tipo: boolean
    destino: Status feedback
    persistido: false
  - campo: model_name
    tipo: string
    destino: UI display
    persistido: false
  - campo: is_free_tier
    tipo: boolean
    destino: UI badge
    persistido: false

Checklist:
  - "[ ] Navegar para configuracoes do modelo no Genspark"
  - "[ ] Localizar opcao Nano Banana Pro"
  - "[ ] Selecionar se nao estiver ja selecionado"
  - "[ ] Confirmar selecao e retornar status"
  - "[ ] Se nao encontrado, usar modelo default e avisar"
---

# Select Nano Banana Pro Model

## Purpose

Garantir que o modelo Nano Banana Pro esta selecionado no Genspark image generator. Este modelo e gratuito para a conta Google logada (andrewebemp@gmail.com), eliminando custos de geracao de imagens.

## Execution Steps

### Step 1: Open Model Settings

```javascript
async function selectNanoBananaPro(page) {
  // Look for model selector/dropdown in the Genspark UI
  const modelSelectors = [
    '[data-testid="model-selector"]',
    'button[aria-label*="model" i]',
    'select[name="model"]',
    '[class*="model-select"]',
    // Look for text that mentions model names
    'button:has-text("Banana")',
    '[class*="dropdown"]:has-text("model")'
  ];

  const modelButton = await findElement(page, modelSelectors, {
    description: 'model selector',
    timeout: 5000
  });

  if (!modelButton) {
    console.log('[NanaBanana] Model selector not found - may be default');
    return { model_selected: false, model_name: 'unknown', is_free_tier: false };
  }

  await modelButton.click();
  await delay(500);
```

### Step 2: Find and Select Nano Banana Pro

```javascript
  // Look for Nano Banana Pro option
  const nanoBananaSelectors = [
    '[data-value*="nano-banana" i]',
    '[data-value*="nanobanana" i]',
    'option:has-text("Nano Banana")',
    '[role="option"]:has-text("Nano Banana")',
    'li:has-text("Nano Banana")',
    'div:has-text("Nano Banana Pro")'
  ];

  const nanoBananaOption = await findElement(page, nanoBananaSelectors, {
    description: 'Nano Banana Pro option',
    timeout: 3000
  });

  if (nanoBananaOption) {
    await nanoBananaOption.click();
    await delay(300);
    console.log('[NanaBanana] Nano Banana Pro selected');
    return { model_selected: true, model_name: 'Nano Banana Pro', is_free_tier: true };
  }

  // Check if already selected by looking at current model display
  const currentModel = await page.evaluate(() => {
    const el = document.querySelector('[class*="model"], [data-model]');
    return el?.textContent || '';
  });

  if (currentModel.toLowerCase().includes('banana')) {
    return { model_selected: true, model_name: 'Nano Banana Pro', is_free_tier: true };
  }

  console.warn('[NanaBanana] Nano Banana Pro not found in model list');
  return { model_selected: false, model_name: currentModel || 'default', is_free_tier: false };
}
```

## Metadata

```yaml
version: 1.0.0
created: 2026-02-16
author: squad-creator
tags:
  - genspark-browser-automation
  - nano-banana-pro
  - model-selection
```

---

*Task definition created by squad-creator*
