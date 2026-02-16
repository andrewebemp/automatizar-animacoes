# Stack Research - Genspark Browser Automation

> Focus: Technical stack decisions for CDP-based browser automation
> Confidence: HIGH (verified against official docs and source code)

---

## 1. Puppeteer CDP Connection (`puppeteer.connect` vs `puppeteer.launch`)

### The Core Decision

`puppeteer.launch()` starts a NEW Chrome/Chromium process. `puppeteer.connect()` attaches to an EXISTING Chrome process via WebSocket. For this project, **connect is required** to preserve the user's Google login cookies.

### Connection Pattern

```javascript
const puppeteer = require('puppeteer-core');

// Connect to Chrome already running with --remote-debugging-port=9222
const browser = await puppeteer.connect({
  browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/browser/<id>',
  defaultViewport: null // Use Chrome's existing viewport
});
```

### Discovering the WebSocket Endpoint

Chrome exposes its debug endpoint at `http://localhost:<port>/json/version`:

```javascript
const http = require('http');

function getWSEndpoint(port = 9222) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const { webSocketDebuggerUrl } = JSON.parse(data);
        resolve(webSocketDebuggerUrl);
      });
    }).on('error', reject);
  });
}
```

### Critical: `browser.disconnect()` vs `browser.close()`

When using `puppeteer.connect()`, calling `browser.close()` will **kill the user's entire Chrome** with all their tabs. Must use `browser.disconnect()` instead:

```javascript
// WRONG: kills user's Chrome
await browser.close();

// CORRECT: detaches Puppeteer, Chrome continues running
browser.disconnect();
```

### Launching Chrome with Debug Port

If Chrome is not running with `--remote-debugging-port`, we need to launch it:

```javascript
const { execFile } = require('child_process');

function launchChromeWithDebugPort(chromePath, profileDir, port = 9222) {
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check'
  ];

  const proc = execFile(chromePath, args, { detached: true });
  proc.unref(); // Don't wait for Chrome to exit
  return proc;
}
```

### Connection Lifecycle

1. Check if Chrome is running with debug port (try `http://127.0.0.1:9222/json/version`)
2. If yes: `puppeteer.connect()` to existing instance
3. If no: Launch Chrome with `--remote-debugging-port=9222` and user's profile
4. Wait for endpoint to become available (poll with backoff)
5. Connect via WebSocket
6. On finish: `browser.disconnect()` (never `browser.close()`)

### Reconnection

The WebSocket can drop (Chrome crash, network issue). Listen for the `disconnected` event:

```javascript
browser.on('disconnected', () => {
  console.log('Browser disconnected, attempting reconnect...');
  // Re-discover endpoint and reconnect
});
```

---

## 2. puppeteer-core vs puppeteer

### Key Difference

| Feature | puppeteer | puppeteer-core |
|---------|-----------|----------------|
| Bundled Chromium | Yes (~170MB) | No |
| `puppeteer.launch()` | Works out of box | Needs `executablePath` |
| `puppeteer.connect()` | Works | Works |
| Package size | ~200MB | ~2MB |

### Recommendation: Use `puppeteer-core`

Since we're connecting to the user's existing Chrome, we don't need the bundled Chromium. Switch from `puppeteer` to `puppeteer-core` to save ~200MB:

```javascript
// Before (current codebase)
const puppeteer = require('puppeteer');

// After (recommended)
const puppeteer = require('puppeteer-core');
```

Both packages share the same API for `connect()`. The only difference is launch behavior.

### Compatibility Note

The project currently has `puppeteer: "^24.37.1"` in dependencies. `puppeteer-core` follows the same versioning: `puppeteer-core@24.37.1` has identical APIs.

---

## 3. Chrome DevTools Protocol for Network Interception

### Two Approaches for Image Detection

#### Approach A: Passive Monitoring (Recommended for image detection)

Use `Network.responseReceived` + `Network.getResponseBody` to passively monitor image responses without blocking any requests:

```javascript
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');

// Bypass service workers to see ALL traffic
await cdp.send('Network.setBypassServiceWorker', { bypass: true });

const imageResponses = [];

cdp.on('Network.responseReceived', async (params) => {
  const { requestId, response, type } = params;

  // Filter for images > 50KB (skip avatars, icons)
  if (type === 'Image' && response.mimeType?.startsWith('image/')) {
    const contentLength = parseInt(response.headers['content-length'] || '0');
    if (contentLength > 50000) {
      // Get the actual image data
      try {
        const { body, base64Encoded } = await cdp.send('Network.getResponseBody', { requestId });
        const buffer = base64Encoded
          ? Buffer.from(body, 'base64')
          : Buffer.from(body);
        imageResponses.push({ url: response.url, buffer });
      } catch (e) {
        // Response body may not be available yet
        console.warn('Could not get response body:', e.message);
      }
    }
  }
});
```

**Important:** `Network.getResponseBody` can only be called AFTER `Network.loadingFinished` fires for that request. Best to listen for `loadingFinished` and then retrieve the body:

```javascript
cdp.on('Network.loadingFinished', async (params) => {
  const { requestId } = params;
  // Check if this requestId was a tracked image
  if (trackedImageRequests.has(requestId)) {
    const { body, base64Encoded } = await cdp.send('Network.getResponseBody', { requestId });
    // Process image...
  }
});
```

#### Approach B: Active Interception (Fetch domain)

Use `Fetch.enable` + `Fetch.requestPaused` when you need to modify or block requests. This replaces the deprecated `Network.setRequestInterception`:

```javascript
await cdp.send('Fetch.enable', {
  patterns: [
    { urlPattern: '*', requestStage: 'Response', resourceType: 'Image' }
  ]
});

cdp.on('Fetch.requestPaused', async (params) => {
  const { requestId, responseStatusCode } = params;

  try {
    if (responseStatusCode === 200) {
      const { body, base64Encoded } = await cdp.send('Fetch.getResponseBody', { requestId });
      // Process the image body...
    }
  } finally {
    // MUST always continue or the request hangs forever
    await cdp.send('Fetch.continueRequest', { requestId });
  }
});
```

### Recommendation

Use **passive monitoring** (Approach A) for image detection. It doesn't interfere with page loading, doesn't block web workers, and is simpler. Reserve Fetch domain for cases where you need to modify requests.

### Service Worker Bypass

Genspark may use service workers for caching. Bypass them to ensure we see all network traffic:

```javascript
await cdp.send('Network.setBypassServiceWorker', { bypass: true });
```

---

## 4. ARIA-Based Selectors in Puppeteer 24.x

### Built-in Locator API

Puppeteer 24.x supports ARIA selectors and a locator API for resilient element discovery:

```javascript
// ARIA selector — finds by accessible name
const textarea = await page.$('aria/Message input');
const button = await page.$('aria/Submit[role="button"]');

// Locator API — auto-waits and retries
const locator = page.locator('aria/Generate Image');
await locator.click();
```

### Selector Strategies (Priority Order)

For resilient selectors that survive UI updates:

1. **ARIA selectors**: `aria/Submit`, `aria/Generate` — based on accessible names
2. **Text selectors**: `text/Generate Image` — match visible text content
3. **XPath with text**: `//button[contains(text(), "Generate")]`
4. **Role + attribute**: `[role="textbox"]`, `[role="button"]`
5. **CSS with data attributes**: `[data-testid="submit-btn"]` (if available)
6. **CSS structural**: `.chat-input textarea` (least stable)

### Discovery Engine Pattern

```javascript
const SELECTOR_STRATEGIES = {
  textarea: [
    { type: 'aria', selector: 'aria/Message' },
    { type: 'css', selector: '[role="textbox"]' },
    { type: 'css', selector: 'textarea' },
    { type: 'xpath', selector: '//textarea[contains(@placeholder, "")]' }
  ],
  submitButton: [
    { type: 'aria', selector: 'aria/Submit' },
    { type: 'css', selector: '[role="button"][aria-label*="send" i]' },
    { type: 'css', selector: 'button[type="submit"]' },
    { type: 'xpath', selector: '//button[contains(@class, "send")]' }
  ]
};

async function discoverElement(page, strategies, timeout = 10000) {
  for (const { type, selector } of strategies) {
    try {
      const element = await page.waitForSelector(selector, { timeout: 2000 });
      if (element) {
        console.log(`Found element via ${type}: ${selector}`);
        return { element, strategy: { type, selector } };
      }
    } catch {
      continue;
    }
  }
  throw new Error('No selector strategy succeeded');
}
```

### Selector Cache

Cache discovered selectors with a TTL to avoid re-discovery on every prompt:

```javascript
const SELECTOR_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedSelector(key) {
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8') || '{}');
  const entry = cache[key];
  if (entry && Date.now() - entry.timestamp < SELECTOR_CACHE_TTL) {
    return entry.strategy;
  }
  return null;
}

function setCachedSelector(key, strategy) {
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8') || '{}');
  cache[key] = { strategy, timestamp: Date.now() };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}
```

---

## 5. puppeteer-extra and Stealth Plugin with CDP Connect

### Compatibility Confirmed

puppeteer-extra's stealth plugin works with **both** `puppeteer.launch()` and `puppeteer.connect()`. The plugin hooks (`onBrowser`, `onPageCreated`) fire regardless of connection method.

### Using with puppeteer-core

```javascript
const { addExtra } = require('puppeteer-extra');
const puppeteerCore = require('puppeteer-core');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Wrap puppeteer-core with puppeteer-extra
const puppeteer = addExtra(puppeteerCore);
puppeteer.use(StealthPlugin());

// Connect — stealth evasions apply to all new pages
const browser = await puppeteer.connect({
  browserWSEndpoint: wsEndpoint,
  defaultViewport: null
});
```

### Stealth Evasions (17 built-in)

Key evasions relevant to this project:
- `navigator.webdriver` → `false`
- Chrome runtime check (removes `window.chrome` artifacts)
- WebGL vendor/renderer spoofing
- Language/plugins spoofing
- User-agent consistency checks
- `chrome.loadTimes` / `chrome.csi` presence

### Important Caveat

When connecting to the user's **real Chrome** (not Puppeteer-launched Chromium), most stealth evasions are unnecessary because:
- The browser is a real Chrome installation with real plugins, extensions, and history
- `navigator.webdriver` is already `false` (Chrome wasn't launched with automation flags)
- WebGL, codecs, and other APIs work normally

The stealth plugin still provides value for the `evaluateOnNewDocument` evasions that protect against CDP detection scripts (e.g., `Runtime.enable` artifacts).

### Issue #513: Pre-existing Pages

When using `puppeteer.connect()`, pages that already exist in Chrome don't trigger `onPageCreated`. Stealth evasions only apply to **newly created** pages. Workaround:

```javascript
// After connecting, manually apply evasions to existing pages
const pages = await browser.pages();
for (const page of pages) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}
```

---

## 6. Electron 28 + Puppeteer Integration Patterns

### Main Process Only

Puppeteer must run in Electron's **main process** (Node.js context), not the renderer process:

```
electron/main.js          → Puppeteer runs here (CommonJS)
  ↓ IPC
src/components/           → React UI here (ESM/TypeScript)
```

### IPC Pattern for Streaming Progress

```javascript
// main.js — register IPC handlers
const { ipcMain } = require('electron');

ipcMain.handle('genspark:generate', async (event, { prompts, config }) => {
  const win = BrowserWindow.fromWebContents(event.sender);

  for (let i = 0; i < prompts.length; i++) {
    win.webContents.send('genspark:progress', {
      current: i + 1,
      total: prompts.length,
      status: 'generating',
      prompt: prompts[i]
    });

    const image = await generateImage(prompts[i]);

    win.webContents.send('genspark:image-ready', {
      index: i,
      buffer: image.toString('base64')
    });
  }

  return { success: true, count: prompts.length };
});
```

### Preload Script Bridge

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  gensparkGenerate: (prompts, config) =>
    ipcRenderer.invoke('genspark:generate', { prompts, config }),

  onGensparkProgress: (callback) =>
    ipcRenderer.on('genspark:progress', (_, data) => callback(data)),

  onGensparkImageReady: (callback) =>
    ipcRenderer.on('genspark:image-ready', (_, data) => callback(data)),

  removeGensparkListeners: () => {
    ipcRenderer.removeAllListeners('genspark:progress');
    ipcRenderer.removeAllListeners('genspark:image-ready');
  }
});
```

### Memory Considerations

Running Puppeteer in Electron means two browser engines in the same process tree. Key guidelines:
- Always detach CDP sessions when done (`cdpSession.detach()`)
- Remove all `page.on()` listeners after each prompt cycle
- Consider reconnecting every 10-15 prompts to reset memory
- Monitor with `process.memoryUsage()` in long batch sessions

---

## Summary: Stack Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Browser package | `puppeteer-core` | No bundled Chromium needed; saves ~200MB |
| Connection method | `puppeteer.connect()` | Preserves user's Chrome session and cookies |
| Cleanup method | `browser.disconnect()` | Never kill user's Chrome |
| Network monitoring | CDP `Network.responseReceived` (passive) | No request blocking, catches all images |
| Selector strategy | ARIA-first with fallback chain | Survives UI updates, accessible names stable |
| Anti-detection | `puppeteer-extra-plugin-stealth` | Works with connect(), protects against CDP detection |
| IPC pattern | `ipcMain.handle` + `webContents.send` streaming | Real-time progress to React UI |
| Module system | CommonJS (`require`) | Electron main process convention |

---

## Sources

- [Puppeteer Browser Management docs](https://pptr.dev/guides/browser-management)
- [Puppeteer Network Interception docs](https://pptr.dev/guides/network-interception)
- [CDP Network domain specification](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [CDP Fetch domain specification](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/)
- [CDPSession API - pptr.dev](https://pptr.dev/api/puppeteer.cdpsession)
- [puppeteer-extra stealth plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
- [puppeteer-extra issue #513 - stealth with connect()](https://github.com/berstend/puppeteer-extra/issues/513)
- [Using CDP with Puppeteer - Jarrod Overson](https://jarrodoverson.com/post/using-chrome-devtools-protocol-with-puppeteer-737a1300bac0/)
