# Architecture Research: CDP Browser Automation in Electron

**Domain:** Chrome DevTools Protocol automation integrated into Electron desktop app
**Researched:** 2026-02-16
**Confidence:** HIGH (verified across official Puppeteer docs, CDP spec, and existing codebase analysis)

## System Overview

```
+-----------------------------------------------------------------------+
|                        Electron Main Process                           |
|                                                                        |
|  +---------------------+    +---------------------+                    |
|  | ChromeSessionManager|    | GensparkAutomation  |                    |
|  | (NEW)               |    | (REFACTORED)        |                    |
|  |                     |    |                      |                    |
|  | - detect Chrome     |<-->| - inject prompts     |                    |
|  | - launch w/ flags   |    | - submit & wait      |                    |
|  | - connect via CDP   |    | - capture images     |                    |
|  | - reconnect/recover |    | - rate limit mgmt    |                    |
|  | - dispose sessions  |    | - download & save    |                    |
|  +----------+----------+    +----------+-----------+                    |
|             |                          |                                |
|             v                          v                                |
|  +---------------------------------------------+                       |
|  |          IPC Handler Layer (main.js)         |                       |
|  |  genspark:* channels                         |                       |
|  |  - genspark:session-start                    |                       |
|  |  - genspark:session-status                   |                       |
|  |  - genspark:generate-images                  |                       |
|  |  - genspark:cancel                           |                       |
|  |  - genspark:get-profiles                     |                       |
|  +---------------------+-----------------------+                        |
|                         |                                               |
+-------------------------+-----------------------------------------------+
                          | IPC (contextBridge)
                          |
+-------------------------+-----------------------------------------------+
|                    Electron Renderer Process                             |
|                                                                         |
|  +--------------------+                                                 |
|  |   preload.js       |                                                 |
|  |   electronAPI.*    |                                                 |
|  +--------+-----------+                                                 |
|           |                                                             |
|  +--------v-----------+    +--------------------+                       |
|  |  GensparkStep.tsx   |    |  PlaywrightPanel   |                      |
|  |  (wizard container) |--->|  (automation UI)   |                      |
|  +---------------------+    +--------------------+                      |
|                                                                         |
+-------------------------------------------------------------------------+

                          | WebSocket (CDP)
                          |
+-------------------------+-----------------------------------------------+
|                    External Chrome Process                               |
|                                                                         |
|  Chrome launched with --remote-debugging-port=<port>                    |
|  Using user's profile (cookies, sessions, extensions)                   |
|  Navigated to genspark.ai                                               |
|                                                                         |
+-------------------------------------------------------------------------+
```

## Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **ChromeSessionManager** (NEW) | CDP session lifecycle: detect Chrome, launch with debugging flags, connect via `puppeteer-core`, reconnect on disconnect, clean disposal | GensparkAutomation, IPC Layer |
| **GensparkAutomation** (REFACTORED from gensparkPlaywright.js) | Automation logic: prompt injection, submission, image waiting, download, rate limiting, retry | ChromeSessionManager, IPC Layer |
| **IPC Handler Layer** (in main.js) | Thin routing layer: maps `genspark:*` channels to ChromeSessionManager and GensparkAutomation methods, forwards progress events to renderer | ChromeSessionManager, GensparkAutomation, Renderer |
| **preload.js** | Exposes safe `electronAPI.genspark*` methods via contextBridge | IPC Handler Layer, React UI |
| **GensparkStep.tsx** | Wizard step container: tab routing, shared state (aspect ratio, images), prompt management | PlaywrightPanel |
| **PlaywrightPanel** (inside GensparkStep.tsx) | Automation UI: profile selection, output folder, progress display, start/cancel/import actions | preload.js electronAPI |

## Recommended Project Structure

```
electron/
  main.js                       # Window lifecycle + IPC routing (thin)
  chromeSessionManager.js       # NEW: CDP session lifecycle
  gensparkAutomation.js         # REFACTORED from gensparkPlaywright.js
  gensparkSelectors.js          # EXTRACTED: selector definitions + findElement
  gensparkRateLimiter.js        # EXTRACTED: rate limiting logic
  gensparkState.js              # EXTRACTED: generation state persistence
  folderWatcher.js              # EXISTING: unchanged
  preload.js                    # IPC bridge (add new genspark: channels)

src/components/wizard-new/
  GensparkStep.tsx              # EXISTING: refactor PlaywrightPanel out
  panels/
    PlaywrightPanel.tsx         # EXTRACTED from GensparkStep.tsx
```

### Structure Rationale

- **chromeSessionManager.js:** Isolated because session lifecycle (detect, launch, connect, reconnect, dispose) is a distinct concern from automation logic. This module owns the `puppeteer-core` connection and exposes a stable API that GensparkAutomation calls. Separation enables testing session management independently and swapping automation targets later.
- **gensparkAutomation.js:** Renamed from gensparkPlaywright.js because the module uses Puppeteer (not Playwright) and the new architecture uses CDP connection rather than launching a full browser. Contains only automation logic, not browser lifecycle.
- **gensparkSelectors.js, gensparkRateLimiter.js, gensparkState.js:** The current 1465-line gensparkPlaywright.js mixes four concerns. Extracting them produces files under 200 lines each, making each independently testable and maintainable.
- **panels/PlaywrightPanel.tsx:** The current GensparkStep.tsx is 2370 lines. Extracting the PlaywrightPanel (~500 lines) into its own file reduces GensparkStep to ~1800 lines and establishes a pattern for extracting other panels later.

## Architectural Patterns

### Pattern 1: CDP Session Facade

**What:** ChromeSessionManager wraps `puppeteer-core` connection behind a simple interface: `connect()`, `getPage()`, `isConnected()`, `dispose()`. Consumers never import puppeteer-core directly.

**When to use:** Always. All browser interaction goes through this facade.

**Trade-offs:** Adds one layer of indirection, but decouples automation logic from connection mechanics. Worth it because connection logic (detect Chrome, pick port, handle reconnection) is complex and changes independently from automation logic.

**Example:**
```javascript
// electron/chromeSessionManager.js
const puppeteer = require('puppeteer-core');

class ChromeSessionManager {
  #browser = null;
  #page = null;
  #debuggingPort = null;
  #connectionState = 'disconnected'; // disconnected | connecting | connected | error

  /**
   * Detect Chrome installation on the system.
   * Returns the path to chrome.exe or null.
   */
  detectChrome() {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ];
    return candidates.find(p => fs.existsSync(p)) || null;
  }

  /**
   * Launch Chrome with remote debugging enabled, then connect via CDP.
   * @param {object} options - { profilePath, profileDir, port? }
   */
  async connect(options) {
    this.#connectionState = 'connecting';
    const port = options.port || await this.#findFreePort();
    this.#debuggingPort = port;

    // Launch Chrome as child process with --remote-debugging-port
    await this.#launchChrome(options.profilePath, options.profileDir, port);

    // Connect puppeteer-core to the running Chrome instance
    this.#browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${port}`,
      defaultViewport: null // Use Chrome's actual viewport
    });

    // Set up disconnect handler for recovery
    this.#browser.on('disconnected', () => this.#handleDisconnect());

    const pages = await this.#browser.pages();
    this.#page = pages[0] || await this.#browser.newPage();
    this.#connectionState = 'connected';
  }

  getPage() { return this.#page; }
  isConnected() { return this.#connectionState === 'connected'; }

  async dispose() {
    if (this.#browser) {
      await this.#browser.close().catch(() => {});
      this.#browser = null;
      this.#page = null;
    }
    this.#connectionState = 'disconnected';
  }
}
```

### Pattern 2: Event-Driven Progress via IPC

**What:** Automation reports progress through an EventEmitter pattern. The IPC layer subscribes to these events and forwards them to the renderer via `webContents.send()`. The renderer subscribes via `ipcRenderer.on()`.

**When to use:** For all long-running operations (image generation, batch processing).

**Trade-offs:** Creates a push-based flow that matches Electron's IPC model naturally. The alternative (polling via `invoke/handle`) would add latency and complexity.

**Example:**
```javascript
// In GensparkAutomation (main process)
const EventEmitter = require('events');

class GensparkAutomation extends EventEmitter {
  async generateImages(page, config) {
    for (let i = 0; i < config.prompts.length; i++) {
      this.emit('progress', {
        status: 'generating',
        current: i + 1,
        total: config.prompts.length,
        message: `Generating image ${i + 1}/${config.prompts.length}...`
      });
      // ... automation logic
      this.emit('image-generated', { index: i + 1, dataUrl, filePath });
    }
  }
}

// In main.js IPC layer
const automation = new GensparkAutomation();
automation.on('progress', (data) => mainWindow.webContents.send('genspark-progress', data));
automation.on('image-generated', (data) => mainWindow.webContents.send('genspark-image-generated', data));
```

### Pattern 3: Network Interception for Image Capture

**What:** Instead of polling the DOM for new `<img>` elements (current approach), use CDP's `page.on('response')` to intercept network responses matching image content types. This catches images the instant they arrive, before they render in the DOM.

**When to use:** For capturing generated images from Genspark. The current approach (DOM polling every 1s) misses images briefly and is fragile against DOM structure changes.

**Trade-offs:** Network interception is more reliable but requires understanding which URLs contain the actual generated images vs. UI assets. Use URL pattern matching (e.g., filter for domains/paths that serve generated content) combined with response size thresholds.

**Example:**
```javascript
// Set up network interception for image capture
async setupImageCapture(page) {
  const capturedImages = new Set();

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    // Filter for actual generated images (not icons, avatars, etc.)
    if (contentType.startsWith('image/') && !this.#isUiAsset(url)) {
      try {
        const buffer = await response.buffer();
        // Only capture images above a size threshold (generated images are large)
        if (buffer.length > 50000) {
          capturedImages.add({ url, buffer, timestamp: Date.now() });
        }
      } catch (e) {
        // Response may have been consumed; fall back to DOM approach
      }
    }
  });

  return capturedImages;
}
```

## Data Flow

### Primary Flow: Image Generation

```
[User clicks "Start"]
    |
    v
[PlaywrightPanel.tsx] --IPC invoke--> [main.js: genspark:session-start]
    |                                        |
    |                                        v
    |                                  [ChromeSessionManager.connect()]
    |                                        |
    |                                        v (Chrome launched, CDP connected)
    |                                        |
    |                                  [GensparkAutomation.generateImages()]
    |                                        |
    |                      +-----------------+------------------+
    |                      |                                    |
    |               For each prompt:                            |
    |                      |                                    |
    |               [inject prompt]                             |
    |               [submit]                                    |
    |               [wait for image via DOM + network]          |
    |               [download image buffer]                     |
    |               [save to disk]                              |
    |                      |                                    |
    |               emit('image-generated')                     |
    |                      |                                    |
    |  <---IPC send--- [main.js forwards event]                 |
    |                      |                                    |
    v                      v                                    |
[PlaywrightPanel updates state]                                 |
[Shows progress + thumbnail]                                    |
    |                                                           |
    +------- (loop until all prompts done) ---------------------+
    |
    v
[User clicks "Import Images"]
    |
    v
[onImagesGenerated()] --> passed up to wizard parent
```

### Session Lifecycle Flow

```
[Session Start Request]
    |
    v
[Detect Chrome on system]
    |-- Not found --> [Error: "Install Chrome"]
    |
    v
[Check for running Chrome on debug port]
    |-- Found --> [Connect to existing instance]
    |
    v (not found)
[Resolve profile path]
    |-- App profile --> [Clean stale locks, use dedicated dir]
    |-- User profile --> [Validate Chrome is closed for that profile]
    |
    v
[Launch Chrome child_process with flags]
    |-- --remote-debugging-port=<port>
    |-- --user-data-dir=<profilePath>
    |-- --profile-directory=<profileDir>  (if user profile)
    |-- --disable-blink-features=AutomationControlled
    |
    v
[Wait for debug port to accept connections]
    |-- Timeout --> [Error: "Chrome failed to start"]
    |
    v
[puppeteer-core.connect({ browserURL })]
    |
    v
[Register disconnect handler]
    |
    v
[Session CONNECTED]
    |
    +-- On disconnect event:
    |       |
    |       v
    |   [Attempt reconnect (3 retries, exponential backoff)]
    |       |-- Success --> [Session CONNECTED]
    |       |-- Failure --> [Session ERROR, notify UI]
    |
    +-- On dispose request:
            |
            v
        [browser.close()]
        [Kill Chrome child_process if owned]
        [Session DISCONNECTED]
```

### Key Data Flows

1. **Chrome Detection:** ChromeSessionManager scans known Windows paths for chrome.exe. Returns the first found path. This replaces the hardcoded path scanning currently duplicated in gensparkPlaywright.js.

2. **Profile Resolution:** User selects a profile in the UI. The profile path (user-data-dir) and profileDir (subdirectory like "Default" or "Profile 1") are passed through IPC to ChromeSessionManager. App profile uses a dedicated directory under AppData/Roaming with stale lock cleanup.

3. **CDP Connection:** Chrome is launched as a child process with `--remote-debugging-port=N`. `puppeteer-core` connects via `browserURL: http://127.0.0.1:N`. This is preferred over `browserWSEndpoint` because the browserURL approach automatically resolves the WebSocket URL from Chrome's `/json/version` endpoint, which is more resilient to Chrome restarts.

4. **Image Capture (Dual Strategy):** Network interception via `page.on('response')` catches images by content-type header and size threshold. DOM polling (existing approach) serves as fallback. Images are downloaded as Buffer, saved to disk, and converted to base64 data URLs for preview in the renderer.

5. **Progress Reporting:** GensparkAutomation emits events (EventEmitter). IPC layer in main.js subscribes and forwards via `webContents.send()`. Renderer receives via `ipcRenderer.on()` and updates React state.

## Scaling Considerations

This is a desktop app, so "scaling" means handling larger batches and longer sessions reliably, not multi-user concurrency.

| Concern | 10 images | 50 images | 200+ images |
|---------|-----------|-----------|-------------|
| Memory | No concern. Images saved to disk, only thumbnails in memory. | Monitor base64 data URLs in React state (~2-5MB each). Consider lazy loading thumbnails. | Must stream thumbnails. Consider showing only visible images in viewport. |
| Session stability | Single session is fine. | Need reconnection handling. Chrome may disconnect after 30+ min. | Must have robust reconnection + state persistence. Resume from last completed prompt on crash. |
| Rate limiting | Minimal concern. | Rate limiter essential. 3-5s delays between prompts. | Adaptive delays. Cooldown escalation. Consider pausing overnight and resuming. |
| Disk I/O | Negligible. | ~500MB of images. Ensure disk space check before starting. | 2-10GB. Must validate disk space. Consider compression. |

### Scaling Priorities

1. **First bottleneck: Session disconnection.** Chrome or the CDP WebSocket can drop after extended automation. The ChromeSessionManager's reconnect logic with exponential backoff (up to 3 retries) is the most important reliability feature.
2. **Second bottleneck: Rate limiting.** Genspark will throttle or block after too many rapid requests. The existing rate limiter (max 10/min, 1min cooldown) is well-designed. The new architecture should preserve this logic in the extracted gensparkRateLimiter.js.

## Anti-Patterns

### Anti-Pattern 1: Launching a Full Bundled Browser

**What people do:** Use `puppeteer` (full package) which downloads and bundles its own Chromium, then launch it for automation.
**Why it's wrong:** Adds ~170MB to app bundle. Cannot reuse the user's Chrome session (cookies, login state). The user must log in again every time. This is what the current codebase does.
**Do this instead:** Use `puppeteer-core` to connect to the user's installed Chrome via CDP. The user stays logged into Genspark through their own Chrome profile. Remove `puppeteer` from dependencies; keep only `puppeteer-core`.

### Anti-Pattern 2: Mixing Session Lifecycle with Automation Logic

**What people do:** Put browser launch, profile detection, CDP connection, navigation, prompt injection, image capture, and cleanup all in one monolithic function (the current `generateImages()` at 300+ lines).
**Why it's wrong:** Cannot test session management independently. Cannot reuse a session across multiple automation runs. Error recovery requires re-launching Chrome from scratch.
**Do this instead:** ChromeSessionManager owns the browser lifecycle. GensparkAutomation receives a `page` object and only performs automation. A session can persist across multiple generate calls.

### Anti-Pattern 3: Polling DOM for Generated Images

**What people do:** Use `setInterval` + `page.$$eval('img', ...)` to scan the DOM for new images every second (current approach in `waitForImage()`).
**Why it's wrong:** Misses images that appear and get replaced quickly. Fragile against DOM restructuring. Incurs unnecessary DOM queries. Cannot distinguish generated images from UI elements reliably.
**Do this instead:** Use network response interception as the primary image detection mechanism, with DOM polling as a fallback. Network responses have content-type headers and size that reliably identify generated images.

### Anti-Pattern 4: Storing All Images as Base64 in React State

**What people do:** Convert every generated image to a data URL and store it in component state for display.
**Why it's wrong:** Each image is 2-10MB as base64. With 50+ images, this consumes 100-500MB of renderer process memory. React re-renders become sluggish.
**Do this instead:** Store file paths in state. Use `<img src="file:///...">` (or a local file server) for thumbnails. Generate thumbnails at reduced resolution for preview. Only convert to base64 when the user explicitly selects images for import into the project.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Chrome (user's installed) | Launch as child_process with `--remote-debugging-port`, connect via puppeteer-core `browserURL` | Must detect Chrome path on Windows. User must have Chrome installed. |
| Genspark.ai | Navigate to URL, interact with DOM elements, capture network responses | Third-party web app. Selectors will break when Genspark updates their UI. Must maintain fallback selectors. |
| File system | Save images to user-selected output folder | Check disk space before batch. Handle permissions errors. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| ChromeSessionManager <-> GensparkAutomation | Direct method calls. Session manager passes `page` object to automation. | Both run in main process. No serialization needed. |
| Main process <-> Renderer | IPC via `ipcMain.handle` / `ipcMain.on` + `ipcRenderer.invoke` / `ipcRenderer.on` | Use `invoke/handle` for request-response (start session, get profiles). Use `send/on` for push events (progress, image generated, errors). |
| GensparkAutomation <-> Genspark.ai | CDP commands via Puppeteer page API. DOM selectors with fallback chains. | Selectors are the most fragile integration point. The existing multi-selector fallback pattern (SELECTORS object) is well-designed and should be preserved. |
| ChromeSessionManager <-> Chrome process | child_process.spawn for launch. WebSocket (CDP) for control. HTTP for `/json/version` endpoint. | Port selection must avoid conflicts. Use dynamic port allocation with fallback. |

## Critical Dependency: puppeteer-core vs puppeteer

The project currently lists both `puppeteer` (24.37.1) and `puppeteer-core` (24.37.1) as dependencies. The new architecture should:

1. **Keep `puppeteer-core`** -- lightweight, no bundled browser, connects to user's Chrome
2. **Remove `puppeteer`** -- its bundled Chromium is not needed; the app uses the user's Chrome
3. **Also remove `playwright`** (1.49.0) -- listed as dependency but the codebase uses Puppeteer, not Playwright. This is dead weight in the bundle.

This reduces `node_modules` size by approximately 200MB+.

**Confidence:** HIGH -- verified via official Puppeteer docs that `puppeteer-core` supports `connect()` with `browserURL`, which is the only API this architecture needs.

## Build Order (Dependencies Between Components)

The following build order respects component dependencies:

```
Phase 1: ChromeSessionManager (no internal dependencies)
    |
    v
Phase 2: Extract gensparkSelectors.js, gensparkRateLimiter.js, gensparkState.js
         (extracted from existing gensparkPlaywright.js, no new logic)
    |
    v
Phase 3: GensparkAutomation (depends on ChromeSessionManager + extracted modules)
         (refactor gensparkPlaywright.js to use ChromeSessionManager)
    |
    v
Phase 4: IPC Layer updates in main.js + preload.js
         (depends on GensparkAutomation API being stable)
    |
    v
Phase 5: React UI updates (PlaywrightPanel extraction + new session UI)
         (depends on IPC API being defined)
```

**Phase 1 has zero dependencies** on existing code and can be built and tested in isolation. This is the recommended starting point.

**Phase 2 is pure extraction** -- moving existing code into separate files with no behavior changes. Low risk.

**Phase 3 is the riskiest phase** -- rewiring gensparkPlaywright.js to use ChromeSessionManager instead of directly calling `puppeteer.launch()`. Should be done incrementally: first make both paths work (feature flag), then remove the old path.

**Phases 4 and 5** are mechanical -- updating the IPC contracts and UI to match the new backend structure.

## Sources

- [Chrome DevTools Protocol specification](https://chromedevtools.github.io/devtools-protocol/) -- HIGH confidence
- [Puppeteer CDPSession API](https://pptr.dev/api/puppeteer.cdpsession) -- HIGH confidence
- [Puppeteer connect() API](https://pptr.dev/api/puppeteer.puppeteer.connect) -- HIGH confidence
- [Puppeteer network interception guide](https://pptr.dev/guides/network-interception) -- HIGH confidence
- [Electron IPC tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc) -- HIGH confidence
- [Puppeteer issue #3543: using existing Chrome](https://github.com/puppeteer/puppeteer/issues/3543) -- MEDIUM confidence
- [Connecting Puppeteer to existing Chrome](https://medium.com/@jaredpotter1/connecting-puppeteer-to-existing-chrome-window-8a10828149e0) -- MEDIUM confidence
- [CDP Fetch domain for response interception](https://jsoverson.medium.com/using-chrome-devtools-protocol-with-puppeteer-737a1300bac0) -- MEDIUM confidence
- [puppeteer-core vs puppeteer](https://www.educative.io/answers/puppeteer-vs-puppeteer-core) -- MEDIUM confidence

---
*Architecture research for: CDP browser automation in Electron desktop app*
*Researched: 2026-02-16*
