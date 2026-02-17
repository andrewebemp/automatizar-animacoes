# Phase 1: CDP Session Management - Research

**Researched:** 2026-02-17
**Domain:** Chrome DevTools Protocol (CDP) session management via puppeteer-core
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Chrome Discovery
- Try to connect to an already-running Chrome with debug port first; launch a new Chrome instance as fallback only if no running Chrome is found
- Default debug port: 9222 (standard), with fallback to a random available port if 9222 is occupied
- Auto-detect Chrome installation path via Windows registry and common install locations, with a manual override option in settings
- If Chrome is running WITHOUT the debug port: show a message asking user to close Chrome, then the app will relaunch it with the debug flag. Do NOT auto-kill Chrome.

#### Connection Behavior
- Reuse an existing Genspark tab if one is already open in Chrome
- If no Genspark tab is found, auto-navigate a new tab to genspark.ai/agents/image-generator
- Minimize Chrome window after connecting (user can restore if needed)
- When automation finishes: leave Chrome open, disconnect cleanly. Do not close any tabs or the browser.

#### Failure & Recovery
- On WebSocket disconnect: notify user with "Connection lost, reconnecting..." message, then retry
- Retry timing: exponential backoff -- 3s, 6s, 12s (3 attempts total)
- If all 3 retries fail: show error message with a "Try Again" button. User decides when to retry. Do not auto-relaunch.
- Login detection: after connecting, check if user is logged into Google on Genspark. If not, show a warning "Please log into Google on Genspark first" and pause automation. Do not block -- warn and pause.

#### Profile Selection
- Show a dropdown list of available Chrome profiles for user to select
- Display format: "email@example.com (Profile Name)" -- both email and profile name visible
- Remember the last selected profile and auto-select it on next launch
- When connecting to an already-running Chrome: verify that the connected profile matches the expected/saved profile. Warn if different.

### Claude's Discretion
- Exact implementation of Chrome path auto-detection (registry keys, fallback paths)
- WebSocket endpoint discovery mechanism (HTTP /json/version polling)
- How to read Chrome profile metadata (Local State file parsing)
- Internal state machine for session lifecycle transitions

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

## Summary

This phase replaces the existing `puppeteer.launch()` approach (which creates a new Chrome process and loses user state) with `puppeteer-core.connect()` that attaches to the user's existing Chrome browser via the Chrome DevTools Protocol. The key challenge is a **Chrome 136+ security restriction** (released April 2025) that blocks `--remote-debugging-port` on Chrome's default user data directory. This means we cannot simply launch the user's default Chrome profile with a debug flag. The workaround is to use `--user-data-dir` pointing to a dedicated debug profile directory, where the user logs in once and the session persists across automation runs.

The architecture splits into: (1) Chrome discovery and connection via CDP HTTP endpoints, (2) Chrome launch with correct flags as a fallback, (3) clean disconnect via `browser.disconnect()`, (4) custom reconnection logic since puppeteer-core has no built-in reconnection, and (5) profile metadata reading from Chrome's `Local State` JSON file.

The project already has `puppeteer-core@24.37.1` installed (alongside full `puppeteer@24.37.1`), so no new dependencies are needed. The existing `gensparkPlaywright.js` already contains Chrome profile listing and path detection logic that can be refactored into the new `ChromeSessionManager` module.

**Primary recommendation:** Use `puppeteer-core.connect({ browserURL: 'http://127.0.0.1:9222' })` to connect to an already-running Chrome, with a fallback that launches Chrome via `child_process.spawn()` using `--remote-debugging-port=9222 --user-data-dir=<dedicated-debug-profile-path> --profile-directory=<selected-profile>`. The dedicated debug profile directory preserves cookies and login state across restarts.

## Critical Finding: Chrome 136+ Security Restriction

### The Problem

Starting with Chrome 136 (released April 2025, now the current stable version), `--remote-debugging-port` and `--remote-debugging-pipe` **no longer work** when Chrome uses its default user data directory. This is a deliberate security measure to prevent malware/infostealers from exploiting remote debugging to extract cookies.

**Source:** [Changes to remote debugging switches to improve security (Chrome Developer Blog)](https://developer.chrome.com/blog/remote-debugging-port)

### Impact on This Phase

The user decision says "connect to the user's existing Chrome preserving cookies and Google login." Chrome 136+ makes this impossible via the naive approach of launching Chrome's default profile with `--remote-debugging-port`. The flag is silently ignored on default profiles.

### Recommended Approach

Use `--user-data-dir` pointing to a **dedicated automation profile directory** (e.g., `%APPDATA%/AutomatizarAnimacoes/ChromeDebugProfile`). This directory:
- Has its own encryption key (Chrome 136 requirement)
- Persists all cookies, login state, and extensions across runs
- Requires the user to log in **once** on first use (one-time setup)
- Is NOT the same as Chrome's default `User Data` directory

This is the same pattern used by Chrome DevTools MCP integrations and browser automation frameworks post-Chrome 136. The user's regular Chrome profile remains untouched and protected.

**Confidence:** HIGH -- Verified via Chrome Developer Blog, multiple GitHub issues, and community workaround patterns.

### What This Means for the User

1. **First run:** User will need to log into Google/Genspark in the debug Chrome window (one-time)
2. **Subsequent runs:** Login persists automatically because `--user-data-dir` points to the same directory
3. **User's regular Chrome** is never modified or affected

### Alternative: Connect to Already-Running Debug Chrome

If Chrome is already running with `--remote-debugging-port` (e.g., user started it manually or from a previous app session), we can connect directly via `puppeteer-core.connect()` without needing to launch anything. This path is unaffected by Chrome 136 restrictions because the browser is already running with the debug port active.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| puppeteer-core | 24.37.1 (installed) | CDP connection to Chrome | Official Chrome automation library; `connect()` API attaches to existing browser |
| electron (ipcMain/ipcRenderer) | 28.3.3 (installed) | IPC between main and renderer | Already used in project for all browser automation communication |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:child_process | built-in | Launch Chrome with debug flags | When no running Chrome with debug port is found |
| node:net | built-in | Check if port 9222 is in use | Before attempting CDP connection; before choosing port for launch |
| node:fs | built-in | Read Chrome Local State JSON | Profile metadata extraction (email, name) |
| node:http | built-in | Poll `http://localhost:9222/json/version` | Discover WebSocket endpoint for CDP connection |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| puppeteer-core | chrome-remote-interface | Lower-level CDP client; puppeteer-core already installed and provides higher-level API |
| node:http for /json/version | puppeteer-core `browserURL` option | `browserURL` does the HTTP fetch internally -- simpler, use this |
| Manual WebSocket management | puppeteer-core built-in | puppeteer-core handles WS transport; we only add reconnection logic on top |

**Installation:**
```bash
# No new packages needed -- puppeteer-core@24.37.1 already in package.json
```

## Architecture Patterns

### Recommended Module Structure
```
electron/
├── main.js                          # Existing entry point, registers IPC handlers
├── chrome-session/                  # NEW: Phase 1 module
│   ├── ChromeSessionManager.js      # Lifecycle: connect, getPage, dispose
│   ├── chromeDiscovery.js           # Find Chrome executable, detect running instances
│   ├── chromeProfileReader.js       # Parse Local State, list profiles with emails
│   └── types.js                     # JSDoc typedefs for session state, events
├── gensparkPlaywright.js            # EXISTING: Will be refactored in Phase 2 to use ChromeSessionManager
├── folderWatcher.js                 # EXISTING: Unchanged
└── preload.js                       # EXISTING: Add new IPC channel exposures
```

### Pattern 1: State Machine for Session Lifecycle
**What:** ChromeSessionManager uses explicit state transitions to prevent invalid operations
**When to use:** Managing a resource with distinct lifecycle phases

```javascript
// Source: Architecture recommendation based on CDP lifecycle requirements
const SessionState = {
  IDLE: 'idle',           // No connection
  DISCOVERING: 'discovering', // Looking for Chrome
  CONNECTING: 'connecting',   // CDP handshake in progress
  CONNECTED: 'connected',     // Active session, page available
  RECONNECTING: 'reconnecting', // Lost connection, retrying
  DISPOSED: 'disposed'       // Permanently closed
};

class ChromeSessionManager {
  #state = SessionState.IDLE;
  #browser = null;
  #page = null;
  #wsEndpoint = null;
  #retryCount = 0;

  async connect(options) {
    this.#assertState([SessionState.IDLE, SessionState.DISPOSED]);
    this.#setState(SessionState.DISCOVERING);
    // ... discovery, connection logic
    this.#setState(SessionState.CONNECTED);
  }

  async getPage() {
    this.#assertState([SessionState.CONNECTED]);
    return this.#page;
  }

  async dispose() {
    if (this.#browser) {
      await this.#browser.disconnect(); // NOT .close()
      this.#browser = null;
    }
    this.#setState(SessionState.DISPOSED);
  }

  #setState(newState) {
    const prev = this.#state;
    this.#state = newState;
    this.emit('stateChanged', { from: prev, to: newState });
  }

  #assertState(allowed) {
    if (!allowed.includes(this.#state)) {
      throw new Error(`Invalid state: ${this.#state}. Expected: ${allowed.join(', ')}`);
    }
  }
}
```

### Pattern 2: CDP Connection with browserURL Convenience
**What:** Use `browserURL` instead of manually fetching `browserWSEndpoint`
**When to use:** When connecting to Chrome on a known port

```javascript
// Source: Puppeteer official docs (Context7 /puppeteer/puppeteer)
const puppeteer = require('puppeteer-core');

// puppeteer-core internally fetches http://127.0.0.1:9222/json/version
// to discover the WebSocket endpoint
const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null, // Use Chrome's existing viewport
});

// Find existing Genspark tab
const pages = await browser.pages();
const gensparkPage = pages.find(p => p.url().includes('genspark.ai'));

// Disconnect (not close!) to leave Chrome running
await browser.disconnect();
```

### Pattern 3: Chrome Launch with Debug Port
**What:** Spawn Chrome with correct flags when no debug-enabled Chrome is found
**When to use:** Fallback when no Chrome with debug port is detected

```javascript
// Source: Chrome Developer Blog + Node.js child_process docs
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

function launchChromeWithDebugPort(chromePath, port, profileDir) {
  const debugProfilePath = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'AutomatizarAnimacoes',
    'ChromeDebugProfile'
  );

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${debugProfilePath}`,  // Required for Chrome 136+
  ];

  // If user selected a specific profile
  if (profileDir) {
    args.push(`--profile-directory=${profileDir}`);
  }

  const child = spawn(chromePath, args, {
    detached: true,  // Let Chrome outlive the app
    stdio: 'ignore'
  });

  child.unref(); // Don't keep app alive for Chrome

  return child;
}
```

### Pattern 4: Port Availability Check
**What:** Check if port 9222 has a listener before attempting connection
**When to use:** First step in the connection flow

```javascript
// Source: Node.js net module standard pattern
const net = require('net');

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);  // Port is in use (something is listening)
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}
```

### Pattern 5: Reconnection with Exponential Backoff
**What:** Detect disconnect and retry connection with increasing delays
**When to use:** When the CDP WebSocket drops unexpectedly

```javascript
// Source: puppeteer Browser 'disconnected' event + standard backoff pattern
browser.on('disconnected', async () => {
  if (this.#state === SessionState.DISPOSED) return; // Intentional disconnect

  this.#setState(SessionState.RECONNECTING);
  this.emit('connectionLost');

  const delays = [3000, 6000, 12000]; // User-specified: 3s, 6s, 12s

  for (let attempt = 0; attempt < delays.length; attempt++) {
    await sleep(delays[attempt]);

    try {
      // Re-fetch WS endpoint and reconnect
      this.#browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${this.#port}`,
        defaultViewport: null,
      });
      this.#setupDisconnectHandler();
      this.#setState(SessionState.CONNECTED);
      this.emit('reconnected', { attempt: attempt + 1 });
      return;
    } catch (err) {
      this.emit('reconnectFailed', { attempt: attempt + 1, error: err.message });
    }
  }

  // All retries exhausted
  this.#setState(SessionState.IDLE);
  this.emit('reconnectExhausted');
});
```

### Anti-Patterns to Avoid
- **Using `browser.close()` on the user's Chrome:** This kills ALL Chrome windows and tabs. Always use `browser.disconnect()`.
- **Using `puppeteer.launch()` for CDP connection:** This spawns a new browser process. For connecting to existing Chrome, use `puppeteer-core.connect()` exclusively.
- **Hardcoding the WebSocket endpoint URL:** The WS endpoint contains a unique UUID that changes every Chrome restart. Always discover it via `/json/version` or use `browserURL`.
- **Using Chrome's default user data directory with `--remote-debugging-port`:** Chrome 136+ silently ignores this. Always use a dedicated debug profile directory.
- **Killing Chrome processes automatically:** User decision explicitly forbids auto-killing. Show a message asking user to close Chrome.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket endpoint discovery | HTTP fetch to `/json/version` + JSON parse | `puppeteer.connect({ browserURL })` | puppeteer-core does the fetch internally |
| CDP transport management | Raw WebSocket client | puppeteer-core's built-in transport | Handles framing, protocol versioning, message routing |
| Chrome process detection | `tasklist` parsing | `net.Socket` port check on 9222 | Faster, cross-platform, directly answers "is debug port open?" |
| Profile email extraction | Custom Chrome DB parsing | Read `Local State` JSON (`profile.info_cache`) | Simple JSON file, no SQLite or LevelDB needed |
| Chrome path on Windows | Manual path strings | Windows registry query + fallback paths | Registry is authoritative; filesystem paths vary by install type |

**Key insight:** puppeteer-core already handles the complex parts (CDP protocol, WebSocket management, page lifecycle). We only need to build the orchestration layer (discovery, launch, reconnection, profile selection) on top.

## Common Pitfalls

### Pitfall 1: Chrome 136+ Default Profile Restriction
**What goes wrong:** `--remote-debugging-port` is silently ignored when Chrome uses its default user data directory. No error is thrown -- Chrome just starts without the debug port.
**Why it happens:** Chrome 136 security change (April 2025) to prevent infostealer malware.
**How to avoid:** Always use `--user-data-dir` pointing to a dedicated automation profile directory (e.g., `%APPDATA%/AutomatizarAnimacoes/ChromeDebugProfile`). This directory persists cookies and login state across runs. User logs in once.
**Warning signs:** Connection to `localhost:9222` times out even though Chrome appears to have launched successfully.

### Pitfall 2: Chrome Already Running Without Debug Port
**What goes wrong:** If Chrome is already running (without `--remote-debugging-port`), launching a new Chrome with `--remote-debugging-port` opens a new window in the existing process -- which ignores the debug flag entirely.
**Why it happens:** Chrome's single-instance behavior. The second `chrome.exe` delegates to the already-running process and exits.
**How to avoid:** First check if Chrome is running. If it is running without the debug port, inform the user: "Please close Chrome so the app can relaunch it with debugging enabled." This matches the locked user decision.
**Warning signs:** Port 9222 never opens even after launching Chrome with the correct flags.

### Pitfall 3: browser.close() vs browser.disconnect()
**What goes wrong:** `browser.close()` terminates the entire Chrome process -- all windows, all tabs, all state.
**Why it happens:** Developers accustomed to `puppeteer.launch()` + `browser.close()` workflow.
**How to avoid:** ALWAYS use `browser.disconnect()` when connected via `puppeteer.connect()`. This detaches puppeteer from Chrome without shutting it down. Chrome continues running with all tabs intact.
**Warning signs:** User's Chrome closes unexpectedly after automation.

### Pitfall 4: WebSocket Endpoint UUID Changes on Restart
**What goes wrong:** Storing the WS endpoint (`ws://127.0.0.1:9222/devtools/browser/<uuid>`) and reusing it after Chrome restarts. The UUID changes.
**Why it happens:** Each Chrome instance generates a new unique WebSocket endpoint ID.
**How to avoid:** Never cache the WebSocket URL long-term. Always re-discover via `browserURL` or HTTP `/json/version` on each connection attempt.
**Warning signs:** "WebSocket connection failed" errors on reconnection attempts.

### Pitfall 5: Port Collision on 9222
**What goes wrong:** Another application (or a stale Chrome debug instance) already occupies port 9222.
**Why it happens:** Port 9222 is the widely-known default for Chrome debugging.
**How to avoid:** Before launching Chrome: check if 9222 is in use. If it IS in use, try connecting (might be our Chrome from a previous session). If connection fails (wrong app on port), fall back to a random available port.
**Warning signs:** `EADDRINUSE` when launching Chrome, or connecting to a non-Chrome service on 9222.

### Pitfall 6: puppeteer-core Has No Built-In Reconnection
**What goes wrong:** Assuming puppeteer-core will auto-reconnect after a WebSocket drop. It does not.
**Why it happens:** The `disconnected` event fires, but puppeteer-core takes no recovery action. This is by design.
**How to avoid:** Listen for the `disconnected` event on the `Browser` object. Implement custom reconnection logic with exponential backoff (3s, 6s, 12s as specified in user decisions).
**Warning signs:** Automation silently stops working mid-run with no error visible to the user.

### Pitfall 7: Profile Lock Files Preventing Launch
**What goes wrong:** Chrome fails to start because lock files exist in the user data directory from a previous crash.
**Why it happens:** Chrome writes `lockfile`, `SingletonLock`, `SingletonSocket`, `SingletonCookie` files. If Chrome crashes, these may persist.
**How to avoid:** Before launching Chrome with the debug profile, attempt to clean stale lock files (the existing `gensparkPlaywright.js` already has `cleanupStaleLocks()` for this). Only clean files in the dedicated automation profile, never the user's default profile.
**Warning signs:** "User data directory is already in use" error from Chrome.

## Code Examples

### Full Connection Flow (Discovery -> Connect -> Fallback Launch)

```javascript
// Source: puppeteer-core official docs + Chrome CDP documentation
const puppeteer = require('puppeteer-core');
const net = require('net');
const { spawn } = require('child_process');

const DEFAULT_PORT = 9222;

async function connectOrLaunch({ chromePath, port = DEFAULT_PORT, debugProfilePath }) {
  // Step 1: Check if port is already listening
  const portInUse = await isPortInUse(port);

  if (portInUse) {
    // Step 2a: Try to connect to existing Chrome
    try {
      const browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${port}`,
        defaultViewport: null,
      });
      return { browser, launched: false };
    } catch (err) {
      // Port is in use but not by Chrome CDP -- try a different port
      port = await findFreePort();
    }
  }

  // Step 2b: Check if Chrome is running WITHOUT debug port
  const chromeRunning = await isChromeRunning();
  if (chromeRunning) {
    throw new Error('CHROME_NO_DEBUG_PORT');
    // Caller shows: "Please close Chrome so the app can relaunch it"
  }

  // Step 3: Launch Chrome with debug port
  const child = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${debugProfilePath}`,
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  // Step 4: Wait for Chrome to start accepting connections
  await waitForPort(port, 15000); // 15s timeout

  // Step 5: Connect
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: null,
  });

  return { browser, launched: true };
}
```

### Finding or Creating a Genspark Tab

```javascript
// Source: puppeteer-core browser.pages() API
async function getGensparkPage(browser) {
  const pages = await browser.pages();

  // Look for existing Genspark tab
  const existingPage = pages.find(p =>
    p.url().includes('genspark.ai')
  );

  if (existingPage) {
    return existingPage;
  }

  // No existing tab -- create new one
  const newPage = await browser.newPage();
  await newPage.goto('https://genspark.ai/agents/image-generator', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  return newPage;
}
```

### Reading Chrome Profile Metadata (Windows)

```javascript
// Source: Chrome forensics documentation + existing codebase pattern
const fs = require('fs');
const path = require('path');
const os = require('os');

function listChromeProfiles() {
  const chromeUserData = path.join(
    os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data'
  );
  const localStatePath = path.join(chromeUserData, 'Local State');

  if (!fs.existsSync(localStatePath)) return [];

  const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
  const infoCache = localState.profile?.info_cache || {};

  return Object.entries(infoCache).map(([dirName, info]) => ({
    profileDir: dirName,            // "Default", "Profile 1", etc.
    name: info.name || dirName,     // User-set profile name
    email: info.user_name || null,  // Google account email
    gaiaName: info.gaia_name || null,
    avatarIcon: info.avatar_icon || null,
    isDefault: dirName === 'Default',
  }));
}
```

### Chrome Path Auto-Detection (Windows)

```javascript
// Source: Windows registry documentation + Chromium installer docs
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function findChromePath() {
  // Method 1: Windows Registry (most reliable)
  const registryPaths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
  ];

  for (const regPath of registryPaths) {
    try {
      const result = execSync(
        `reg query "${regPath}" /ve`,
        { encoding: 'utf8', timeout: 3000 }
      );
      const match = result.match(/REG_SZ\s+(.+)/);
      if (match && fs.existsSync(match[1].trim())) {
        return match[1].trim();
      }
    } catch (e) {
      // Registry key not found, try next
    }
  }

  // Method 2: Common installation paths (fallback)
  const commonPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null; // Not found -- user must set manually
}
```

### Login Detection on Genspark

```javascript
// Source: Standard page evaluation pattern
async function checkGoogleLoginStatus(page) {
  try {
    // Wait for page to be fully loaded
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 })
      .catch(() => {}); // Ignore if already loaded

    // Check for login indicators
    const isLoggedIn = await page.evaluate(() => {
      // Look for absence of login/sign-in buttons
      const loginButtons = document.querySelectorAll(
        'button, a'
      );

      for (const btn of loginButtons) {
        const text = (btn.textContent || '').toLowerCase();
        if (text.includes('sign in') || text.includes('log in') || text.includes('login')) {
          return false;
        }
      }

      // Look for user avatar or profile indicator (positive signal)
      const avatars = document.querySelectorAll(
        'img[alt*="avatar"], img[alt*="profile"], [class*="avatar"], [class*="user-icon"]'
      );

      return avatars.length > 0;
    });

    return isLoggedIn;
  } catch (err) {
    // If evaluation fails, assume not logged in (safe default)
    return false;
  }
}
```

### Minimizing Chrome Window via CDP

```javascript
// Source: CDP Browser.setWindowBounds method
async function minimizeChromeWindow(browser) {
  try {
    const pages = await browser.pages();
    if (pages.length === 0) return;

    const session = await pages[0].createCDPSession();
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'minimized' }
    });
    await session.detach();
  } catch (err) {
    // Non-critical -- log and continue
    console.warn('Could not minimize Chrome window:', err.message);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `puppeteer.launch()` with user profile | `puppeteer-core.connect()` via CDP | Ongoing best practice | Preserves user session, avoids profile lock conflicts |
| `--remote-debugging-port` on default profile | `--remote-debugging-port` + `--user-data-dir` (non-default) | Chrome 136 (April 2025) | **BREAKING**: Default profile debugging silently disabled |
| `browser.close()` for cleanup | `browser.disconnect()` for connected sessions | Always for `connect()` usage | Prevents killing user's browser |
| Hardcoded WS endpoint | `browserURL` auto-discovery | puppeteer v1.11+ | More robust, handles endpoint UUID changes |

**Deprecated/outdated:**
- Using `--remote-debugging-port` without `--user-data-dir` on Chrome 136+ (silently fails)
- The existing project's `puppeteer.launch()` approach in `gensparkPlaywright.js` (creates new process, loses cookies)
- Copying the user's default Chrome profile to a new directory (breaks encryption keys, doesn't preserve active session)

## Open Questions

1. **Profile verification when connecting to already-running Chrome**
   - What we know: When Chrome is already running with debug port, we can connect and get pages. We can read page URLs and cookies.
   - What's unclear: How to determine WHICH Chrome profile is active in the connected browser from the CDP side. The `Target.getTargetInfo()` gives page URLs but not the profile directory.
   - Recommendation: Compare the user data directory path from `/json/version` response (it appears in the `User-Agent` or can be inferred). Alternatively, check cookies or navigate to `chrome://version` and read the profile path. Mark this as a low-priority enhancement -- the user decision says "warn if different" which implies best-effort detection.

2. **Electron app + Chrome debug port coexistence**
   - What we know: Electron uses its own Chromium instance. The debug port is for the external Chrome, not Electron.
   - What's unclear: Whether Electron's internal Chromium could ever conflict with port 9222 if Electron itself were launched with debugging. Very unlikely in practice since we control Electron's launch flags.
   - Recommendation: No action needed. Just don't use `--remote-debugging-port` on the Electron app itself.

## Sources

### Primary (HIGH confidence)
- [puppeteer/puppeteer (Context7 /puppeteer/puppeteer)](https://github.com/puppeteer/puppeteer) -- `connect()`, `disconnect()`, `ConnectOptions`, `BrowserEvent.Disconnected`, `browser.pages()`
- [Chrome Developer Blog: Changes to remote debugging switches](https://developer.chrome.com/blog/remote-debugging-port) -- Chrome 136 security restriction details
- [Puppeteer Browser Management Guide](https://pptr.dev/guides/browser-management) -- `browserURL` vs `browserWSEndpoint`, connect/disconnect patterns

### Secondary (MEDIUM confidence)
- [Connecting Puppeteer to Existing Chrome Window (Medium)](https://medium.com/@jaredpotter1/connecting-puppeteer-to-existing-chrome-window-8a10828149e0) -- Practical walkthrough of connect flow
- [Chrome DevTools MCP Setup (raf.dev)](https://raf.dev/blog/chrome-debugging-profile-mcp/) -- Chrome 136 workaround using dedicated debug profile
- [browser-use/browser-use#1520](https://github.com/browser-use/browser-use/issues/1520) -- Community discussion of Chrome 136 impact and workarounds
- [Chrome DevTools Protocol FAQ](https://github.com/ChromeDevTools/devtools-protocol/issues/55) -- HTTP endpoints /json/version, /json/list
- [Chromium Installer documentation](https://www.chromium.org/developers/installer/) -- Registry key locations for Chrome path

### Tertiary (LOW confidence)
- [puppeteer/puppeteer#6756](https://github.com/puppeteer/puppeteer/issues/6756) -- Feature request for built-in reconnection (confirmed: not implemented as of v24)
- [puppeteer/puppeteer#12219](https://github.com/puppeteer/puppeteer/issues/12219) -- Lost connection detection limitations (confirmed: known issue)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- puppeteer-core 24.x API verified via Context7, already installed in project
- Architecture: HIGH -- State machine pattern, connect/disconnect lifecycle well-documented
- Chrome 136 restriction: HIGH -- Verified via official Chrome Developer Blog + multiple independent sources
- Pitfalls: HIGH -- Most pitfalls verified via official docs or GitHub issues with reproduction steps
- Reconnection: MEDIUM -- Custom implementation needed since puppeteer-core has no built-in reconnection; pattern is standard but untested in this specific context
- Profile verification (connected Chrome): LOW -- Approach for detecting which profile is active needs runtime validation

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (30 days -- CDP APIs are stable; Chrome version may affect debug port behavior)
