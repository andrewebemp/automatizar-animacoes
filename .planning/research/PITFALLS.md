# Domain Pitfalls

**Domain:** Electron desktop app with CDP-based Chrome automation for Genspark image generation
**Researched:** 2026-02-16
**Confidence:** HIGH (verified against official Puppeteer docs, GitHub issues, and current codebase)

---

## Critical Pitfalls

Mistakes that cause data loss, crashes, or require significant rewrites.

---

### Pitfall 1: `browser.close()` Kills the User's Entire Chrome Session

**What goes wrong:** The current codebase (`gensparkPlaywright.js` line 877) calls `activeBrowser.close()` in the `finally` block. When migrating to `puppeteer.connect()` (attaching to the user's running Chrome via CDP), calling `browser.close()` terminates the *entire* Chrome process -- closing every tab, losing unsaved work, and killing all the user's active sessions.

**Why it happens:** `browser.close()` sends a `Browser.close` CDP command, which instructs Chrome to shut down completely. When Puppeteer *launched* the browser, this makes sense -- Puppeteer owns the process. But when Puppeteer *connected* to an existing browser, it does not own the process and should not kill it.

**Consequences:**
- User loses all open tabs, unsaved form data, downloads in progress
- Google login cookies may not be flushed to disk if Chrome shuts down abruptly
- User trust in the application is destroyed

**Prevention:** Use `browser.disconnect()` instead of `browser.close()` when the browser was obtained via `puppeteer.connect()`. Track ownership explicitly:

```javascript
// Track how the browser was obtained
let browserOwnership = 'connected'; // or 'launched'

async function cleanup() {
  if (!activeBrowser) return;

  try {
    // Close only pages WE created
    if (ownedPages && ownedPages.length > 0) {
      for (const page of ownedPages) {
        try {
          await page.close();
        } catch (e) {
          // Page may already be closed
        }
      }
    }

    if (browserOwnership === 'connected') {
      // We connected to user's browser -- just disconnect, never close
      activeBrowser.disconnect();
    } else {
      // We launched this browser -- safe to close
      await activeBrowser.close();
    }
  } catch (e) {
    console.warn('[Cleanup] Error during browser cleanup:', e.message);
  } finally {
    activeBrowser = null;
    activePage = null;
    ownedPages = [];
  }
}
```

**Detection:** Test by connecting to your personal Chrome with multiple tabs open. If the automation closes your browser, this pitfall is active.

**Confidence:** HIGH -- verified in [Puppeteer official docs](https://pptr.dev/guides/browser-management) and [Puppeteer Browser API](https://pptr.dev/api/puppeteer.browser).

---

### Pitfall 2: Chrome Profile Locking -- "User data directory already in use"

**What goes wrong:** When Chrome is already running with a profile and the automation tries to `puppeteer.launch()` with the same `--user-data-dir`, Chrome refuses with: *"The profile appears to be in use by another Chromium process"*. The current code already handles this (line 708) but the error message suggests workarounds that do not apply to the new CDP connection approach.

**Why it happens:** Chrome creates `SingletonLock`, `SingletonSocket`, and `SingletonCookie` files in the user data directory. Only one Chrome process can hold these locks at a time. This is a fundamental Chrome architecture constraint, not a Puppeteer bug.

**Consequences:**
- On Windows, lock files are actual file system locks that cannot be deleted while Chrome is running
- The `cleanupStaleLocks()` function (line 473) works after crashes but not while Chrome is actively running
- Users get a confusing error and cannot proceed

**Prevention:** The migration to `puppeteer.connect()` via CDP **eliminates this problem entirely**. Instead of launching a new Chrome process that fights over the profile, connect to the *already running* Chrome:

```javascript
// Step 1: User starts Chrome with remote debugging (or app launches it)
// chrome.exe --remote-debugging-port=9222

// Step 2: Get the WebSocket endpoint
async function getDebuggerEndpoint(port = 9222) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.webSocketDebuggerUrl);
        } catch (e) {
          reject(new Error('Invalid response from Chrome debugger'));
        }
      });
    }).on('error', (err) => {
      reject(new Error(
        'Chrome is not running with --remote-debugging-port. ' +
        'Please restart Chrome with: chrome.exe --remote-debugging-port=9222'
      ));
    });
  });
}

// Step 3: Connect (no profile lock conflict!)
const wsEndpoint = await getDebuggerEndpoint(9222);
const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
```

**Edge case on Windows:** If Chrome was NOT started with `--remote-debugging-port`, the debugger endpoint is not available. The app must either:
1. Detect that Chrome is running without debugging, prompt the user to restart it
2. Launch Chrome itself with the flag (but then Chrome must not already be running with the same profile)
3. Use a helper that creates a Chrome shortcut with the flag pre-configured

**Detection:** `SingletonLock` error in the Puppeteer launch stack trace, or connection refused on `http://127.0.0.1:9222/json/version`.

**Confidence:** HIGH -- verified in [Puppeteer issue #4860](https://github.com/puppeteer/puppeteer/issues/4860), [Puppeteer issue #3543](https://github.com/puppeteer/puppeteer/issues/3543).

---

### Pitfall 3: Cookie/Login State Not Preserved with `userDataDir` in Puppeteer Launch

**What goes wrong:** Even when pointing `puppeteer.launch()` at the user's actual Chrome `User Data` directory, login sessions (Google login, Genspark cookies) are not available. The browser opens with bookmarks and profile picture visible, but the user is logged out of every website.

**Why it happens:** Multiple root causes documented in [Puppeteer issue #10666](https://github.com/puppeteer/puppeteer/issues/10666):
1. **Credential Manager separation:** Chrome stores passwords in the OS keychain (Windows Credential Manager), not in the user data directory. Puppeteer's launched Chrome cannot access these.
2. **Cookie encryption:** Chrome encrypts cookies using DPAPI on Windows tied to the specific Chrome process. A different Chrome process (launched by Puppeteer) may get different encryption keys.
3. **Path mismatch:** Puppeteer may internally resolve `userDataDir` to a different path than expected. Verify with `chrome://version` after launch.
4. **`--enable-automation` flag:** This flag (which Puppeteer adds by default) causes Chrome to use a separate cookie jar in some configurations.

**Consequences:** The entire purpose of using the user's Chrome profile (preserving Google login to Genspark) is defeated. Users must log in manually every time.

**Prevention:** The CDP connection approach avoids this entirely because you are connecting to the *same Chrome process* that already has the cookies. No credential transfer needed.

```javascript
// WRONG: Launch with userDataDir -- cookies often missing
const browser = await puppeteer.launch({
  userDataDir: 'C:\\Users\\X\\AppData\\Local\\Google\\Chrome\\User Data',
  args: ['--profile-directory=Default']
});

// RIGHT: Connect to already-running Chrome -- cookies preserved
const browser = await puppeteer.connect({
  browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/browser/...'
});
// User is already logged in -- all cookies, localStorage, sessionStorage available
```

**Detection:** Navigate to `genspark.ai` after connection and check `checkIfLoggedIn()`. If the login button is present despite the user being logged in on their regular Chrome, this pitfall is active.

**Confidence:** HIGH -- directly verified in [Puppeteer #10666](https://github.com/puppeteer/puppeteer/issues/10666), [Puppeteer #1316](https://github.com/puppeteer/puppeteer/issues/1316), [Puppeteer #6666](https://github.com/puppeteer/puppeteer/issues/6666).

---

### Pitfall 4: Memory Leaks in Long-Running Electron + Puppeteer Sessions

**What goes wrong:** CDP event handlers accumulate over time and are never cleaned up. Each page navigation, each `page.on('response')` listener, each `page.evaluate()` call creates internal CDP subscriptions. After processing 20-50 prompts, the Electron app's memory usage balloons from 200MB to 1GB+, eventually causing freezes or crashes.

**Why it happens:** Multiple contributing factors documented in [Puppeteer issue #5043](https://github.com/puppeteer/puppeteer/issues/5043):
1. **CDP domain handlers leak:** When a Page is created, Puppeteer calls `Network.enable`, `Runtime.enable`, etc. When the page is destroyed, `Network.disable` is *never called*. Registered event handlers for those domains persist in memory.
2. **EventEmitter listener accumulation:** Adding `page.on('response', handler)` without removing it before navigating or creating new pages causes `MaxListenersExceededWarning`.
3. **CDP sessions not detached:** `page.createCDPSession()` creates sessions that must be manually detached with `session.detach()`. The current code never calls this.
4. **Electron's own IPC listeners:** `mainWindow.webContents.send('genspark-progress', data)` in rapid callbacks can cause IPC message queue buildup.

**Consequences:**
- Progressive slowdown during batch generation
- Electron app becomes unresponsive
- Node.js heap overflow crash after extended sessions
- Orphaned Chrome processes consuming RAM in the background

**Prevention:**

```javascript
// 1. Always remove page event listeners before navigating away
function setupPageListeners(page) {
  const handlers = {
    response: (response) => { /* handle */ },
    console: (msg) => { /* handle */ },
  };

  for (const [event, handler] of Object.entries(handlers)) {
    page.on(event, handler);
  }

  // Return cleanup function
  return () => {
    for (const [event, handler] of Object.entries(handlers)) {
      page.off(event, handler);
    }
  };
}

// 2. Detach CDP sessions explicitly
async function withCDPSession(page, callback) {
  const session = await page.createCDPSession();
  try {
    await callback(session);
  } finally {
    await session.detach().catch(() => {});
  }
}

// 3. Track and clean up ALL resources per prompt cycle
async function processPromptWithCleanup(page, prompt) {
  const cleanupListeners = setupPageListeners(page);
  try {
    await injectPrompt(page, prompt);
    await submitPrompt(page);
    const imageUrl = await waitForImage(page, 120000);
    return imageUrl;
  } finally {
    cleanupListeners();
  }
}

// 4. Monitor memory and force GC periodically
function monitorMemory(label) {
  const usage = process.memoryUsage();
  console.log(`[Memory:${label}] RSS: ${Math.round(usage.rss / 1024 / 1024)}MB, ` +
    `Heap: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);

  // Force garbage collection if available (start node with --expose-gc)
  if (global.gc && usage.heapUsed > 500 * 1024 * 1024) {
    console.log('[Memory] Forcing garbage collection...');
    global.gc();
  }
}
```

**Detection:** Warning sign: `MaxListenersExceededWarning: Possible EventEmitter memory leak detected`. Monitor `process.memoryUsage().rss` -- if it grows monotonically across prompt iterations without stabilizing, this pitfall is active.

**Confidence:** HIGH -- verified in [Puppeteer #5043](https://github.com/puppeteer/puppeteer/issues/5043), [Puppeteer #9283](https://github.com/puppeteer/puppeteer/issues/9283), [Puppeteer #4684](https://github.com/puppeteer/puppeteer/issues/4684).

---

### Pitfall 5: React Controlled Component Input Injection Fails Silently

**What goes wrong:** The current `injectPrompt()` function (line 1254) tries to set the textarea value via `page.evaluate(el => { el.value = ''; }, textarea)` and then `textarea.type(prompt, { delay: 10 })`. On React-managed textareas, `el.value = 'text'` is silently ignored by React's synthetic event system. The value appears in the DOM briefly but React overwrites it on the next render cycle because its internal state was never updated.

**Why it happens:** Since React 15.6.0, React intercepts the native `value` setter on input/textarea elements. When you set `.value` directly, React's internal `_valueTracker` still holds the old value. When you then dispatch an `'input'` event, React compares the new value against its tracker, sees "no change" (because the tracker was never updated), and suppresses the event. Documented in [React issue #10135](https://github.com/facebook/react/issues/10135).

**Consequences:**
- Prompt text appears to be entered but React's state is empty
- Submit sends an empty prompt or the previous prompt
- Silent failure -- no error thrown, but wrong image generated
- The current fallback (line 1277) dispatches `new Event('input')` but this also fails because React's value tracker is not bypassed

**Prevention:** Use the native value setter trick to bypass React's interception:

```javascript
async function injectPromptReactSafe(page, prompt) {
  const textarea = await findElement(page, SELECTORS.textarea, {
    description: 'prompt textarea',
    required: true,
    timeout: 10000
  });

  // Click and focus
  await textarea.click();
  await delay(100);

  // Method 1: Use native value setter to bypass React's value tracker
  await page.evaluate((el, text) => {
    // Get the native setter from the prototype (React overrides the instance setter)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set;

    // Call the native setter -- this updates the DOM without React knowing
    nativeInputValueSetter.call(el, text);

    // Dispatch 'input' event -- React will now see a "new" value
    // because the native setter bypassed React's _valueTracker
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Also dispatch 'change' for good measure
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, textarea, prompt);

  await delay(200);

  // Verify the value was actually set in React's state
  const actualValue = await page.evaluate(el => el.value, textarea);
  if (actualValue !== prompt) {
    console.warn('[InjectPrompt] React setter may have failed, trying keyboard input...');

    // Fallback: clear and type character by character (slow but reliable)
    await textarea.click({ clickCount: 3 }); // Select all
    await page.keyboard.press('Backspace');
    await textarea.type(prompt, { delay: 15 });
  }

  console.log('[InjectPrompt] Prompt injected, verified length:', actualValue.length);
}
```

**Important note for contenteditable divs:** If Genspark uses a `contenteditable` div instead of a `<textarea>`, the approach changes:

```javascript
// For contenteditable elements (NOT textarea)
await page.evaluate((el, text) => {
  el.textContent = text;
  el.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: text
  }));
}, element, prompt);
```

**Detection:** After injecting the prompt, verify: `const val = await page.evaluate(el => el.value, textarea)`. If `val` is empty or does not match the prompt, this pitfall is active.

**Confidence:** HIGH -- verified in [React #10135](https://github.com/facebook/react/issues/10135), [Cory Rylan's blog post](https://coryrylan.com/blog/trigger-input-updates-with-react-controlled-inputs).

---

## Moderate Pitfalls

Issues that cause degraded behavior, flakiness, or require workarounds.

---

### Pitfall 6: Blob URL and Data URL Cross-Origin Image Download Failures

**What goes wrong:** Genspark may serve generated images as `blob:` URLs (created via `URL.createObjectURL()`) or images hosted on a different domain CDN. The current `downloadImage()` function (line 1380) handles blob URLs via a canvas workaround, but this approach has cross-origin limitations and silently produces corrupt or blank images.

**Why it happens:**
1. **Blob URLs are origin-scoped:** A `blob:` URL created on `genspark.ai` can only be accessed by code running in the `genspark.ai` origin. Puppeteer's `page.evaluate()` runs in the page context so this works, but the approach of drawing to canvas and reading back via `toDataURL()` is subject to canvas taint.
2. **CORS taint on canvas:** If the image was fetched cross-origin without CORS headers, drawing it to a canvas and calling `toDataURL()` throws `SecurityError: Tainted canvases may not be exported`.
3. **`page.evaluate()` cannot return Blobs/Buffers:** Serialization over CDP wire only supports JSON-serializable values. Blobs and ArrayBuffers cannot be returned directly from `page.evaluate()`. Documented in [Puppeteer #3722](https://github.com/puppeteer/puppeteer/issues/3722).
4. **Headless blob URL crash:** In some Chrome versions, `blob:` URL navigation in headless mode crashes with `ERR_UNKNOWN_URL_SCHEME`.

**Prevention:** Use CDP network interception to capture images at the network layer, bypassing all origin/CORS issues:

```javascript
// Best approach: intercept image responses via CDP
async function setupImageCapture(page) {
  const capturedImages = [];

  // Listen for network responses directly
  page.on('response', async (response) => {
    const contentType = response.headers()['content-type'] || '';
    const url = response.url();

    // Filter for actual generated images (not icons/avatars)
    if (contentType.startsWith('image/') &&
        !url.includes('avatar') &&
        !url.includes('icon') &&
        !url.includes('logo') &&
        !url.includes('.svg')) {
      try {
        const buffer = await response.buffer();
        if (buffer.length > 50000) { // Only substantial images (>50KB)
          capturedImages.push({
            url,
            buffer,
            contentType,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        // Response body may have been evicted from memory
        console.warn('[ImageCapture] Could not get buffer for:', url);
      }
    }
  });

  return capturedImages;
}

// Fallback for blob URLs when network interception misses them
async function downloadBlobImage(page, blobUrl) {
  // Convert blob to base64 entirely within page context
  const base64 = await page.evaluate(async (url) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      // Blob URL may have been revoked
      return null;
    }
  }, blobUrl);

  return base64 ? Buffer.from(base64, 'base64') : null;
}
```

**Detection:** Images saved as 0-byte files, or images that are solid black/transparent when opened. Check `imageBuffer.length` before writing to disk.

**Confidence:** MEDIUM -- verified the issue exists via [Puppeteer #3722](https://github.com/puppeteer/puppeteer/issues/3722) and [Puppeteer #3463](https://github.com/puppeteer/puppeteer/issues/3463). The specific behavior with Genspark's image serving is unverified.

---

### Pitfall 7: Genspark Bot Detection and Anti-Automation Measures

**What goes wrong:** Genspark detects the browser is automated and either blocks requests, shows CAPTCHAs, rate-limits aggressively, or returns lower-quality images. The automation works for 2-3 images then stops.

**Why it happens:** Modern anti-bot systems use multiple detection vectors:
1. **`navigator.webdriver` flag:** Puppeteer sets this to `true` by default. The current code uses `--disable-blink-features=AutomationControlled` (line 679) which helps but is not sufficient.
2. **CDP protocol detection:** Websites can detect that the Chrome DevTools Protocol is active by checking for `Runtime.enable` artifacts. This is a fundamental issue with CDP-based automation. Documented in [puppeteer-extra #899](https://github.com/berstend/puppeteer-extra/issues/899).
3. **Behavioral analysis:** Perfectly consistent timing (e.g., exactly 10ms between keystrokes from `textarea.type(prompt, { delay: 10 })`) is a dead giveaway. Humans type with variable cadence.
4. **Request patterns:** Submitting prompts at exact intervals (the `delayBetweenPrompts` config) looks robotic. Humans have irregular timing.
5. **Missing browser features:** Headless Chrome lacks certain Web APIs (WebGL extensions, media codecs, etc.) that detection scripts check for.

**Prevention:**

```javascript
// 1. Human-like typing with variable delays
async function humanType(page, text, elementHandle) {
  for (const char of text) {
    // Variable delay: fast for common letters, slow for shifts/specials
    const baseDelay = 30 + Math.random() * 80; // 30-110ms
    const isSpecial = /[^a-zA-Z0-9 ]/.test(char);
    const delay = isSpecial ? baseDelay * 1.5 : baseDelay;

    await elementHandle.type(char, { delay: 0 });
    await new Promise(r => setTimeout(r, delay));
  }
}

// 2. Random delays between actions
function humanDelay(minMs, maxMs) {
  const base = minMs + Math.random() * (maxMs - minMs);
  // Occasionally add a longer "thinking" pause
  const thinkingPause = Math.random() < 0.1 ? 2000 + Math.random() * 3000 : 0;
  return new Promise(r => setTimeout(r, base + thinkingPause));
}

// 3. Anti-detection page setup (run via evaluateOnNewDocument)
async function setupStealthPage(page) {
  await page.evaluateOnNewDocument(() => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // Remove CDP artifacts
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

    // Spoof plugins (headless Chrome has 0 plugins)
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Spoof languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'pt-BR'],
    });
  });
}

// 4. Launch Chrome args that reduce detection surface
const stealthArgs = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-infobars',
  // Do NOT use --disable-extensions (it's a detection signal)
  // Do NOT use --headless (use headed mode for Genspark)
];
```

**Critical insight for CDP connection approach:** When connecting to the user's *actual* Chrome (not a Puppeteer-launched instance), most detection vectors are neutralized because:
- `navigator.webdriver` is `false` (user's Chrome was not launched with automation flags)
- The browser has real plugins, extensions, history, and cookies
- The Chrome binary is the user's actual installed version, not Puppeteer's bundled Chromium
- WebGL, media codecs, and other APIs work normally

The CDP connection approach is inherently stealthier than launching a new browser. However, `Runtime.enable` (sent by Puppeteer when it connects) can still be detected. Consider using [rebrowser-patches](https://github.com/nickadam/rebrowser-patches) or limiting CDP domain activation.

**Detection:** Navigation redirects to a CAPTCHA page, HTTP 429 responses, or the page shows "Please verify you are human".

**Confidence:** MEDIUM -- general anti-bot techniques are well-documented, but Genspark's specific detection mechanisms are unverified. The site may use Cloudflare, DataDome, or custom bot detection.

---

### Pitfall 8: Network Interception Gotchas -- Service Workers and CORS

**What goes wrong:** After enabling `page.setRequestInterception(true)`, some requests hang indefinitely, service worker cached resources are invisible, and web workers cannot make network requests.

**Why it happens:**
1. **Service worker interception:** Genspark may use a service worker for caching. Requests served from the SW cache bypass Puppeteer's network interception entirely -- they never fire `'request'` or `'response'` events. Documented in [Puppeteer request interception docs](https://pptr.dev/guides/network-interception).
2. **Worker request blocking:** When `page.setRequestInterception(true)` is active, web workers on the page cannot make `fetch()` or `importScripts()` calls -- they hang indefinitely. Documented in [Puppeteer #4208](https://github.com/puppeteer/puppeteer/issues/4208).
3. **Missing `request.continue()`:** Every intercepted request MUST be continued, aborted, or responded to. If even one request is not handled, it hangs forever, blocking the entire page.
4. **CORS mismatch in headless:** Headless Chrome sends `Origin: null` for some requests, while headed Chrome sends the correct origin. This causes CORS preflight failures.

**Prevention:**

```javascript
// PREFER: Use CDP Fetch domain directly instead of page.setRequestInterception
async function setupNetworkMonitoring(page) {
  const cdpSession = await page.createCDPSession();

  // Bypass service workers so we see ALL network traffic
  await cdpSession.send('Network.setBypassServiceWorker', { bypass: true });

  // Enable network events (passive monitoring, no interception needed)
  await cdpSession.send('Network.enable');

  // Listen for responses
  cdpSession.on('Network.responseReceived', (params) => {
    const { response, type } = params;
    if (type === 'Image' && response.mimeType?.startsWith('image/')) {
      console.log('[Network] Image response:', response.url);
    }
  });

  // If you MUST intercept (modify/block requests), use Fetch domain
  // NOT page.setRequestInterception
  await cdpSession.send('Fetch.enable', {
    patterns: [
      { urlPattern: '*', requestStage: 'Response', resourceType: 'Image' }
    ]
  });

  cdpSession.on('Fetch.requestPaused', async (params) => {
    // ALWAYS continue or fulfill -- never leave a request hanging
    try {
      const { requestId, responseHeaders, responseStatusCode } = params;
      // Process the response...
      await cdpSession.send('Fetch.continueRequest', { requestId });
    } catch (e) {
      // If continue fails, try to fulfill with an error
      try {
        await cdpSession.send('Fetch.failRequest', {
          requestId: params.requestId,
          errorReason: 'Failed'
        });
      } catch (ignored) {}
    }
  });

  return cdpSession; // Caller must detach when done
}
```

**Key rule:** When using `page.setRequestInterception(true)`, wrap all event handlers in try/catch and ALWAYS call `request.continue()`, `request.abort()`, or `request.respond()` for every intercepted request:

```javascript
// DANGEROUS: If the handler throws before continue(), the request hangs forever
page.on('request', (request) => {
  if (someCondition) {
    request.abort(); // What if someCondition throws?
  }
  request.continue(); // This line may never execute
});

// SAFE: Always continue, even on error
page.on('request', (request) => {
  try {
    if (shouldBlock(request)) {
      request.abort();
      return;
    }
  } catch (e) {
    // Fall through to continue
  }
  request.continue();
});
```

**Detection:** Pages that load partially then freeze. `net::ERR_FAILED` or `net::ERR_ABORTED` errors in the console. Infinite loading spinners on the Genspark page.

**Confidence:** HIGH -- verified in [Puppeteer #4208](https://github.com/puppeteer/puppeteer/issues/4208), [CDP Network domain docs](https://chromedevtools.github.io/devtools-protocol/tot/Network/).

---

### Pitfall 9: `browser.close()` Hangs When CDP WebSocket Is Lost

**What goes wrong:** If the Chrome process crashes, the user closes Chrome manually, or the WebSocket connection drops, `await browser.close()` hangs indefinitely and never resolves. The entire Electron app appears frozen.

**Why it happens:** `browser.close()` sends a CDP command and waits for a response. If the WebSocket is dead, the response never arrives. There is no built-in timeout. Documented in [Puppeteer #5331](https://github.com/puppeteer/puppeteer/issues/5331).

**Prevention:**

```javascript
// Wrap close/disconnect with a timeout
async function safeBrowserCleanup(browser, ownership, timeoutMs = 5000) {
  if (!browser) return;

  const cleanup = ownership === 'connected'
    ? () => { browser.disconnect(); return Promise.resolve(); }
    : () => browser.close();

  try {
    await Promise.race([
      cleanup(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Browser cleanup timeout')), timeoutMs)
      )
    ]);
  } catch (e) {
    console.warn('[Cleanup] Browser cleanup failed or timed out:', e.message);
    // Force-kill if we launched the process
    if (ownership === 'launched' && browser.process()) {
      browser.process().kill('SIGKILL');
    }
  }
}

// Also listen for disconnection events to update state
browser.on('disconnected', () => {
  console.log('[Browser] Disconnected (user closed Chrome or crash)');
  activeBrowser = null;
  activePage = null;
  // Notify the renderer process
  mainWindow?.webContents.send('genspark-error', {
    message: 'Chrome was closed. Please restart the automation.',
    fatal: true
  });
});
```

**Detection:** The Electron app freezes during cleanup and must be force-killed via Task Manager.

**Confidence:** HIGH -- verified in [Puppeteer #5331](https://github.com/puppeteer/puppeteer/issues/5331).

---

## Minor Pitfalls

Issues that cause inconvenience or minor bugs but are easily worked around.

---

### Pitfall 10: `page.type()` Slowness and Missing Characters

**What goes wrong:** `page.type(prompt, { delay: 10 })` types each character individually via CDP `Input.dispatchKeyEvent`. For long prompts (500+ characters), this takes 5+ seconds and occasionally drops characters, especially Unicode or emoji characters.

**Why it happens:** Each character requires 3 CDP messages (`keyDown`, `char`, `keyUp`). With a 10ms delay between characters and 3 messages per character, a 500-character prompt takes at minimum 15 seconds of CDP round-trips. Network latency can cause characters to be dropped.

**Prevention:**

```javascript
// For long prompts, use clipboard paste instead of character-by-character typing
async function fastInjectPrompt(page, prompt) {
  const textarea = await findElement(page, SELECTORS.textarea, {
    description: 'prompt textarea',
    required: true
  });

  await textarea.click();

  // Use clipboard API to paste (much faster than typing)
  await page.evaluate(async (text) => {
    // Write to clipboard
    await navigator.clipboard.writeText(text);
  }, prompt);

  // Ctrl+V to paste
  await page.keyboard.down('Control');
  await page.keyboard.press('v');
  await page.keyboard.up('Control');

  await delay(200);

  // Note: clipboard API requires the page to have focus and permission.
  // Fallback to the React native setter method if clipboard fails.
}
```

**Alternative fallback if clipboard is restricted:**

```javascript
// Use execCommand (deprecated but still works in Chromium)
async function injectViaExecCommand(page, textarea, text) {
  await textarea.click();
  await page.evaluate((el, text) => {
    el.focus();
    // Select all existing content
    document.execCommand('selectAll', false, null);
    // Insert text via execCommand (triggers React's event handlers)
    document.execCommand('insertText', false, text);
  }, textarea, text);
}
```

**Detection:** Prompt text in the textarea does not match the intended prompt. Characters are missing or garbled.

**Confidence:** MEDIUM -- character dropping is documented in [Puppeteer #1648](https://github.com/puppeteer/puppeteer/issues/1648). The clipboard approach works in practice but may fail on pages with restrictive CSP.

---

### Pitfall 11: Outdated User-Agent String Triggers Detection

**What goes wrong:** The current code (line 753) sets a hardcoded user-agent: `Chrome/120.0.0.0`. This version is over 2 years old. Bot detection systems flag outdated Chrome versions because real users auto-update.

**Prevention:**

```javascript
// When connecting to user's Chrome, don't set user-agent at all --
// the real Chrome has the correct, current user-agent.

// If you must set one, derive it from the connected browser:
const version = await browser.version(); // e.g., "Chrome/122.0.6261.69"
console.log('Connected browser version:', version);
// Do NOT override with a hardcoded string
```

**Detection:** Check `navigator.userAgent` on the page. If it shows an old Chrome version while the actual Chrome is newer, this pitfall is active.

**Confidence:** HIGH -- straightforward observation from the codebase.

---

### Pitfall 12: Puppeteer `page.$$eval` Racing with Dynamic Content

**What goes wrong:** The current `waitForImage()` function (line 1304) polls with `page.$$eval('img', ...)` every 1 second. Between the poll and the DOM query, images can appear and disappear (e.g., progressive loading or React re-renders). This causes the automation to either miss images entirely or capture placeholder/loading images.

**Prevention:** Use `MutationObserver` inside the page context for real-time DOM change detection, OR use CDP network events as described in Pitfall 6's prevention:

```javascript
// Use MutationObserver for real-time image detection
async function waitForNewImage(page, timeout = 120000) {
  return page.evaluate((timeoutMs) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timeout waiting for image'));
      }, timeoutMs);

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.tagName === 'IMG' && node.src &&
                !node.src.includes('avatar') && !node.src.includes('icon')) {
              // Wait for image to fully load
              if (node.complete && node.naturalWidth > 200) {
                clearTimeout(timer);
                observer.disconnect();
                resolve(node.src);
                return;
              }
              node.onload = () => {
                if (node.naturalWidth > 200) {
                  clearTimeout(timer);
                  observer.disconnect();
                  resolve(node.src);
                }
              };
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }, timeout);
}
```

**Detection:** The automation reports "Timeout waiting for image" even though the image is visible on the page. Or the downloaded image is a loading placeholder.

**Confidence:** MEDIUM -- based on observed behavior patterns with SPA image generation.

---

### Pitfall 13: Electron Main Process IPC Handler Accumulation

**What goes wrong:** The `main.js` file registers IPC handlers with `ipcMain.handle()` at module load time. These are fine because they are registered once. However, the `onProgress`, `onImageGenerated`, and `onError` callbacks (lines 543-554) create closures that capture `mainWindow`. If the automation is started multiple times, old callbacks are not removed and the previous `mainWindow` reference may be stale.

**Prevention:** The current code structure is actually mostly safe because callbacks are created fresh each invocation. But ensure `mainWindow` is always checked before use:

```javascript
// Always null-check mainWindow before sending
const safeSend = (channel, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
};
```

**Detection:** Errors like "Object has been destroyed" or "Cannot read properties of null" in the Electron main process console after closing and reopening the app window during an active automation.

**Confidence:** HIGH -- standard Electron pattern issue.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| CDP connection setup | Profile locking, Chrome not started with debug flag | Check port availability before connecting; provide clear user instructions or auto-launch Chrome with `--remote-debugging-port` |
| Cookie preservation | Users expect Google login to "just work" | CDP connect inherently preserves cookies -- no extra work needed. Test with real Google login flow. |
| Prompt injection | React controlled component value rejection | Use native value setter trick (Pitfall 5). MUST verify value after injection. |
| Image download | Blob URL / CORS failures | Prefer CDP network interception over DOM-based image extraction. Always have a fallback chain: network response > canvas capture > fetch in page > direct URL download. |
| Rate limiting | Genspark blocks after rapid requests | Human-like timing with jitter, adaptive backoff. Detect HTTP 429 at network layer, not just DOM-based error message scanning. |
| Bot detection | Stealth evasion cat-and-mouse | CDP connect to real Chrome is 90% of the battle. Do not use `--headless`. Do not set fake user-agents. Let the real Chrome be real. |
| Long batch sessions (20+ images) | Memory leaks, event listener accumulation | Clean up all listeners per prompt cycle. Monitor `process.memoryUsage()`. Consider restarting the CDP session (disconnect + reconnect) every 10-15 prompts. |
| Error recovery | Browser crash/disconnect hangs cleanup | Always use timeout wrappers on `browser.close()` and `browser.disconnect()`. Listen for `'disconnected'` event. |
| Parallel tabs | Memory multiplication, rate limit trigger | Limit to 2-3 tabs max. Each tab has its own CDP session and memory overhead. Parallel requests multiply the rate limiting risk. |

---

## Sources

- [Puppeteer #10666 - userDataDir cookie persistence](https://github.com/puppeteer/puppeteer/issues/10666)
- [Puppeteer #5043 - CDP event handler memory leaks](https://github.com/puppeteer/puppeteer/issues/5043)
- [Puppeteer #5331 - browser.close() hangs on WebSocket loss](https://github.com/puppeteer/puppeteer/issues/5331)
- [Puppeteer #4860 - Chrome profile locking](https://github.com/puppeteer/puppeteer/issues/4860)
- [Puppeteer #4208 - Request interception blocks web workers](https://github.com/puppeteer/puppeteer/issues/4208)
- [Puppeteer #3722 - Cannot return blob/ArrayBuffer from evaluate](https://github.com/puppeteer/puppeteer/issues/3722)
- [Puppeteer #3463 - Blob URLs broken in headless](https://github.com/puppeteer/puppeteer/issues/3463)
- [Puppeteer #9283 - Chrome memory leaks with Puppeteer](https://github.com/puppeteer/puppeteer/issues/9283)
- [Puppeteer #1648 - page.type missing characters](https://github.com/puppeteer/puppeteer/issues/1648)
- [React #10135 - dispatchEvent on input/textarea ignored](https://github.com/facebook/react/issues/10135)
- [Puppeteer Browser Management docs](https://pptr.dev/guides/browser-management)
- [Puppeteer Request Interception docs](https://pptr.dev/guides/network-interception)
- [CDP Network domain specification](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [puppeteer-extra stealth detection - #899](https://github.com/berstend/puppeteer-extra/issues/899)
- [Trigger Input Updates with React Controlled Inputs](https://coryrylan.com/blog/trigger-input-updates-with-react-controlled-inputs)
- [Puppeteer issue #3543 - Using current Chrome credentials](https://github.com/puppeteer/puppeteer/issues/3543)
- [Medium - Connecting Puppeteer to Existing Chrome](https://medium.com/@jaredpotter1/connecting-puppeteer-to-existing-chrome-window-8a10828149e0)
- [Puppeteer Memory Leak Journey](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367)
