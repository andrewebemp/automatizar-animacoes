---
task: Resilient Selectors System
responsavel: "@browser-engineer"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: genspark_url
    tipo: string
    origem: Config
    obrigatorio: true
    validacao: "URL valida do Genspark image generator"

Saida:
  - campo: selector_map
    tipo: object
    destino: Browser automation functions
    persistido: true
  - campo: discovery_report
    tipo: object
    destino: Logging
    persistido: false

Checklist:
  - "[ ] Implementar discovery automatico de elementos UI"
  - "[ ] Criar fallback chain com multiplos metodos de deteccao"
  - "[ ] Cachear seletores descobertos para reuso"
  - "[ ] Detectar mudancas na UI e re-descobrir"
  - "[ ] Substituir seletores hardcoded em gensparkPlaywright.js"
---

# Resilient Selectors System

## Purpose

Substituir os seletores CSS hardcoded por um sistema de discovery automatico que encontra elementos UI do Genspark usando multiplas estrategias (ARIA roles, text content, visual position, DOM structure).

## Execution Steps

### Step 1: Discovery Engine

```javascript
const ELEMENT_DISCOVERY = {
  textarea: {
    strategies: [
      // Strategy 1: ARIA role
      { method: 'aria', selector: '[role="textbox"]' },
      // Strategy 2: Semantic HTML
      { method: 'semantic', selector: 'textarea, [contenteditable="true"]' },
      // Strategy 3: Visual position (bottom of page, large input)
      { method: 'position', finder: async (page) => {
        return page.evaluate(() => {
          const inputs = document.querySelectorAll('textarea, [contenteditable]');
          // Find the one near bottom of viewport, largest area
          return Array.from(inputs)
            .map(el => ({ el, rect: el.getBoundingClientRect() }))
            .sort((a, b) => b.rect.bottom - a.rect.bottom)[0]?.el;
        });
      }},
    ]
  },
  submitButton: {
    strategies: [
      { method: 'aria', selector: 'button[type="submit"], button[aria-label*="send" i]' },
      { method: 'proximity', finder: async (page, textarea) => {
        // Find button closest to textarea
        return page.evaluate((ta) => {
          const taRect = ta.getBoundingClientRect();
          const buttons = document.querySelectorAll('button');
          return Array.from(buttons)
            .map(b => ({ el: b, dist: Math.hypot(
              b.getBoundingClientRect().x - taRect.right,
              b.getBoundingClientRect().y - taRect.y
            )}))
            .sort((a, b) => a.dist - b.dist)[0]?.el;
        }, textarea);
      }},
    ]
  },
  generatedImage: {
    strategies: [
      // Network intercept is primary (see network-intercept-images task)
      // DOM fallback for cases where network fails
      { method: 'size', finder: async (page, knownSrcs) => {
        return page.evaluate((known) => {
          return Array.from(document.querySelectorAll('img'))
            .filter(img => img.naturalWidth >= 400 && img.naturalHeight >= 400)
            .filter(img => !known.includes(img.src))
            .map(img => img.src)[0];
        }, knownSrcs);
      }},
    ]
  }
};
```

### Step 2: Selector Cache

```javascript
const CACHE_PATH = path.join(getAppDataPath(), 'selector-cache.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function loadSelectorCache() {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    if (Date.now() - data.timestamp < CACHE_TTL) return data.selectors;
  } catch (e) {}
  return null;
}

function saveSelectorCache(selectors) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify({
    timestamp: Date.now(),
    selectors,
    gensparkVersion: 'auto-detected'
  }));
}
```

## Metadata

```yaml
version: 1.0.0
created: 2026-02-16
author: squad-creator
tags:
  - genspark-browser-automation
  - selectors
  - resilience
```

---

*Task definition created by squad-creator*
