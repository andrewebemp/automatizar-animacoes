---
task: Network Intercept for Image Detection
responsavel: "@browser-engineer"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: page_session
    tipo: object
    origem: ChromeSessionManager
    obrigatorio: true
    validacao: "Puppeteer Page com CDP session ativa"
  - campo: timeout_ms
    tipo: number
    origem: Config
    obrigatorio: false
    validacao: "Timeout em milissegundos (default: 120000)"

Saida:
  - campo: image_url
    tipo: string
    destino: Image download
    persistido: false
  - campo: image_buffer
    tipo: Buffer
    destino: File system save
    persistido: true
  - campo: generation_time_ms
    tipo: number
    destino: Metrics
    persistido: false

Checklist:
  - "[ ] Ativar CDP Network domain na pagina"
  - "[ ] Interceptar respostas com mimeType image/*"
  - "[ ] Filtrar imagens geradas (tamanho, URL pattern)"
  - "[ ] Capturar response body como Buffer"
  - "[ ] Timeout com fallback para DOM polling"
---

# Network Intercept for Image Detection

## Purpose

Detectar imagens geradas pelo Genspark interceptando respostas de rede via CDP Network domain. Isso e muito mais confiavel que polling DOM por elementos `<img>`, pois captura a imagem no momento exato em que ela e recebida pelo navegador.

## Execution Steps

### Step 1: Setup CDP Network Intercept

```javascript
async function setupNetworkIntercept(page) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');

  const imagePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Image timeout')), 120000);

    cdp.on('Network.responseReceived', async (event) => {
      const { response } = event;

      // Filter for generated images
      if (response.mimeType?.startsWith('image/') &&
          response.status === 200 &&
          !response.url.includes('avatar') &&
          !response.url.includes('icon') &&
          !response.url.includes('logo') &&
          !response.url.includes('favicon')) {

        try {
          // Get response body
          const { body, base64Encoded } = await cdp.send(
            'Network.getResponseBody',
            { requestId: event.requestId }
          );

          const buffer = base64Encoded
            ? Buffer.from(body, 'base64')
            : Buffer.from(body);

          // Verify it's a substantial image (not a thumbnail)
          if (buffer.length > 50000) { // > 50KB
            clearTimeout(timeout);
            resolve({
              url: response.url,
              buffer,
              mimeType: response.mimeType,
              size: buffer.length
            });
          }
        } catch (e) {
          // Response body may not be available, continue listening
        }
      }
    });
  });

  return imagePromise;
}
```

### Step 2: Fallback to DOM Detection

```javascript
async function waitForImageWithFallback(page, timeoutMs = 120000) {
  try {
    // Primary: Network intercept
    const result = await setupNetworkIntercept(page);
    return result;
  } catch (e) {
    console.warn('[NetworkIntercept] Fallback to DOM detection:', e.message);
    // Fallback: DOM polling (existing logic from gensparkPlaywright.js)
    return waitForImageDOM(page, timeoutMs);
  }
}
```

## Metadata

```yaml
version: 1.0.0
created: 2026-02-16
author: squad-creator
tags:
  - genspark-browser-automation
  - network-intercept
  - image-detection
```

---

*Task definition created by squad-creator*
