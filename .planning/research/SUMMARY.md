# Project Research Summary

**Project:** Automatizar Animacoes - Electron desktop app for automated whiteboard video generation
**Domain:** CDP-based browser automation for AI image generation in desktop applications
**Researched:** 2026-02-16
**Confidence:** HIGH

## Executive Summary

This milestone improves Genspark browser automation by migrating from `puppeteer.launch()` to CDP-based connection via `puppeteer.connect()`. The current implementation loses Google login cookies on every automation run, forcing manual re-login and preventing access to Genspark's free Nano Banana Pro model. Research confirms that connecting to the user's existing Chrome via Chrome DevTools Protocol preserves all session state, cookies, and authentication.

The recommended approach uses `puppeteer-core` (lightweight, no bundled Chromium) with `connect()` to attach to Chrome launched with `--remote-debugging-port`. Network-based image detection via CDP replaces slow DOM polling (1s intervals) with instant response interception, improving reliability and speed. A resilient selector discovery system with fallback chains addresses Genspark UI changes. The architecture separates session lifecycle management (ChromeSessionManager) from automation logic (GensparkAutomation), enabling session reuse across batches and robust reconnection handling.

Key risks include memory leaks from accumulated CDP event listeners, React controlled input rejection of programmatic value changes, and blob URL download failures. Prevention strategies are well-documented: explicit listener cleanup, native value setter tricks for React, and CDP Fetch domain for network interception. When connecting to the user's real Chrome (versus launching a Puppeteer-controlled browser), most bot detection vectors are naturally avoided because automation flags are absent and the browser has real plugins, history, and credentials.

## Key Findings

### Recommended Stack

The migration from Puppeteer launch to CDP connection eliminates session preservation issues while reducing application bundle size by ~200MB. The key architectural shift separates browser lifecycle (connection, reconnection, cleanup) from automation logic (prompt injection, image capture).

**Core technologies:**
- **puppeteer-core**: CDP connection without bundled Chromium — saves ~200MB, connects to user's Chrome
- **Chrome DevTools Protocol (CDP)**: Native browser control protocol — enables network interception, session preservation
- **CDP Network domain (passive monitoring)**: `Network.responseReceived` + `Network.getResponseBody` — instant image detection without blocking requests
- **CDP Fetch domain (active interception)**: `Fetch.requestPaused` at response stage — advanced control when modification needed (defer unless necessary)
- **ARIA-based selectors with fallback chains**: `aria/Submit`, `[role="button"]`, XPath text-content — survives Genspark UI updates
- **puppeteer-extra-plugin-stealth**: Anti-detection evasions — less critical when connecting to real Chrome but protects against CDP detection scripts
- **Electron IPC (handle + send)**: `ipcMain.handle` for request-response, `webContents.send` for streaming progress — real-time updates to React UI
- **CommonJS module system**: `require()` in main process — Electron convention, Puppeteer is CommonJS-native

**Critical version compatibility:**
- Current: `puppeteer@24.37.1` + `puppeteer-core@24.37.1` (both installed)
- Recommendation: Remove `puppeteer`, keep only `puppeteer-core@24.37.1`
- Also remove: `playwright@1.49.0` (dead weight, not used in codebase despite file name `gensparkPlaywright.js`)

### Expected Features

Research identified 5 table stakes features that must work for basic functionality, 6 differentiators that provide competitive advantage over manual workflows, and 7 anti-features that seem useful but create more problems than they solve.

**Must have (table stakes):**
- **CDP session attach to user's Chrome** — Solves #1 problem (lost login cookies). Launch Chrome with `--remote-debugging-port`, connect via `puppeteer-core.connect()` using `browserURL` or discovered WebSocket endpoint.
- **Graceful browser lifecycle management** — When connected (not launched), call `browser.disconnect()` instead of `browser.close()`. Closing kills all user's tabs. Track ownership explicitly.
- **Network-based image detection** — Replaces 1s DOM polling with instant CDP `page.on('response')` interception. Filter by `content-type: image/*` and size threshold (>50KB). Catches images before DOM render.
- **Resilient element discovery with fallback chains** — Current `SELECTORS` object is well-designed but has Playwright syntax leftovers (`:has-text`, `:near`). Prioritize `[data-testid]`, `[aria-label]`, add XPath text-content fallbacks via `page.$x()`.
- **Model selection (Nano Banana Pro)** — No model selection exists currently. Find model dropdown via aria-label/data-testid, expand options, match by text content, click to select. Apply same fallback chain pattern as textarea/submit.

**Should have (competitive):**
- **Per-image streaming progress** — Extend IPC with fine-grained status: `prompt_injected`, `request_sent`, `image_response_started`, `image_downloading`, `image_saved`. Network events naturally provide these lifecycle hooks.
- **Network-based completion detection** — Watch for Genspark's internal API response (POST to generation endpoint) instead of DOM polling. Faster and catches errors. Requires reverse-engineering API shape during development.
- **Adaptive rate limiting with 429 detection** — Current rate limiter is naive (fixed 10/min cap). Enhance with HTTP 429 status detection from network responses, parse `Retry-After` header, exponential backoff with jitter.
- **Batch resume with per-prompt granularity** — Current state saves `completedCount`. Extend to per-prompt status array: `[{ prompt, status, imagePath, error, attempts }]`. On resume, retry only failed, skip succeeded.
- **Auto-prompt enhancement toggle** — Genspark's "Auto Prompt" feature rewrites prompts. Current code tries to disable it but uses fragile selectors. Make it configurable (enable/disable per batch).
- **Selector health monitoring** — Log which selectors in fallback chains succeed vs fail. Sort by historical success rate. Alert when all fail (Genspark UI changed).

**Defer (v2+):**
- **CDP response body streaming** — `Fetch.takeResponseBodyAsStream` + `IO.read` to stream large images to disk. Only matters for 50+ image batches or very high resolution.
- **Aspect ratio via API interception** — Modify generation request body via `Fetch.enable` instead of clicking UI. Requires reverse-engineering Genspark API. Defer until UI-based approach proves brittle.
- **Stealth plugin integration** — Connecting to user's real Chrome already avoids most detection (no automation flags, real plugins/history). Only add if Genspark actively blocks.
- **Parallel multi-tab generation** — Current parallel implementation has known issues (no per-tab config, shared rate limit triggers bans faster, complex error recovery). Sequential processing with fast network detection is sufficient.

### Architecture Approach

The architecture separates browser lifecycle (ChromeSessionManager) from automation logic (GensparkAutomation), enabling session reuse across batches and robust reconnection. Puppeteer runs in Electron's main process (Node.js context), not the renderer. IPC uses handle/invoke for request-response and send/on for streaming progress. Network interception uses passive monitoring (CDP Network domain) as primary approach with DOM polling as fallback.

**Major components:**
1. **ChromeSessionManager (NEW)** — CDP session lifecycle: detect Chrome, launch with `--remote-debugging-port=<port>`, connect via `puppeteer-core`, expose `getPage()` API, handle reconnection on WebSocket drop, dispose safely (`disconnect()` not `close()`). Runs in main process.
2. **GensparkAutomation (REFACTORED from gensparkPlaywright.js)** — Automation logic: inject prompts (using React-safe native value setter), submit, wait for images (network + DOM fallback), download, rate limit, retry. Receives `page` from ChromeSessionManager, emits progress events. Runs in main process.
3. **IPC Handler Layer (in main.js)** — Thin routing: map `genspark:*` channels to ChromeSessionManager/GensparkAutomation methods. Subscribe to EventEmitter events from automation and forward via `webContents.send()` to renderer. Runs in main process.
4. **Extracted modules (NEW)** — `gensparkSelectors.js` (selector definitions + findElement logic), `gensparkRateLimiter.js` (rate limiting with adaptive backoff), `gensparkState.js` (generation state persistence). Extracted from current 1465-line `gensparkPlaywright.js` to produce files under 200 lines each.
5. **PlaywrightPanel.tsx (EXTRACTED from GensparkStep.tsx)** — Automation UI: profile selection, output folder, progress display, start/cancel/import. Current GensparkStep.tsx is 2370 lines; extracting PlaywrightPanel (~500 lines) reduces to ~1800 lines. Runs in renderer process.

**Data flow:**
User clicks Start → PlaywrightPanel IPC invoke → ChromeSessionManager connects → GensparkAutomation receives page → For each prompt: inject → submit → wait (network + DOM) → download → save → emit event → IPC forwards → PlaywrightPanel updates state/UI.

### Critical Pitfalls

Research documented 13 pitfalls with verified workarounds. Top 5 by severity:

1. **`browser.close()` kills user's entire Chrome** — When using `puppeteer.connect()`, calling `browser.close()` terminates all user's tabs. Current code does this in finally block (line 877 of gensparkPlaywright.js). Prevention: Track ownership (`'connected'` vs `'launched'`), use `browser.disconnect()` when connected, only close pages the automation created. Confidence: HIGH (official Puppeteer docs).

2. **Cookie/login state not preserved with userDataDir in launch** — Even when `puppeteer.launch()` points at user's Chrome profile, cookies are missing due to credential manager separation, cookie encryption (DPAPI), and `--enable-automation` flag. Prevention: Use CDP connection approach — connects to same Chrome process that already has cookies, no credential transfer needed. Confidence: HIGH (Puppeteer #10666, #1316, #6666).

3. **Memory leaks in long-running CDP sessions** — Event handlers accumulate over time. `page.on('response', handler)` without removal, CDP sessions created via `page.createCDPSession()` never detached. After 20-50 prompts, memory balloons from 200MB to 1GB+. Prevention: Always remove page event listeners before navigating, detach CDP sessions explicitly with `session.detach()`, monitor `process.memoryUsage()` and force GC if needed. Confidence: HIGH (Puppeteer #5043, #9283, #4684).

4. **React controlled component input injection fails silently** — Current `injectPrompt()` sets `el.value = text` then dispatches `input` event, but React's `_valueTracker` suppresses the event because it still holds old value. Prompt appears entered but React state is empty. Prevention: Use native value setter from HTMLTextAreaElement prototype to bypass React's interception, then dispatch events. Fallback to character-by-character typing if verification fails. Confidence: HIGH (React #10135).

5. **Blob URL and data URL cross-origin image download failures** — Genspark may serve images as `blob:` URLs or cross-origin CDN. Canvas-based workaround (current `downloadImage()` line 1380) hits CORS taint (`SecurityError: Tainted canvases may not be exported`). `page.evaluate()` cannot return Blobs/Buffers over CDP wire. Prevention: Use CDP network interception to capture images at network layer, bypassing all origin/CORS issues. Fallback to `fetch()` in page context + FileReader for blob URLs. Confidence: MEDIUM (Puppeteer #3722, #3463).

**Additional moderate pitfalls:**
- Chrome profile locking ("User data directory already in use") — CDP connection eliminates this entirely by attaching to already-running Chrome.
- Genspark bot detection — Connecting to user's real Chrome avoids most detection vectors (no automation flags, real plugins/history). Add human-like typing delays and random timing.
- Network interception gotchas — Service workers bypass Puppeteer's request interception. Use `Network.setBypassServiceWorker`. Always call `request.continue()` or requests hang forever.
- `browser.close()` hangs when WebSocket lost — Wrap cleanup with 5s timeout, force-kill if launched process.

## Implications for Roadmap

Based on research, suggested phase structure prioritizes session management foundation, then core automation improvements, then enhancements:

### Phase 1: CDP Session Management Foundation
**Rationale:** Session preservation is the #1 stated problem. ChromeSessionManager has zero dependencies on existing automation code and can be built/tested in isolation. All subsequent phases depend on stable CDP connection.

**Delivers:**
- ChromeSessionManager module (detect Chrome, launch with debug port, connect, reconnect, dispose)
- Browser ownership tracking (connected vs launched)
- Safe cleanup (`disconnect()` not `close()`)
- Reconnection handling on WebSocket drop
- IPC handlers for session lifecycle (`genspark:session-start`, `genspark:session-status`)

**Addresses:** Table stakes feature "CDP session attach to user's Chrome", prevents Pitfall #1 (browser.close() kills user tabs), Pitfall #2 (cookie preservation), eliminates Pitfall #6 (profile locking).

**Avoids:** Memory leaks by establishing cleanup patterns from start. Session lifecycle is isolated from automation logic.

### Phase 2: Core Automation Refactoring
**Rationale:** Once session management is stable, refactor automation to use it. Extract mixed concerns from 1465-line monolith into focused modules. Improve prompt injection to handle React inputs.

**Delivers:**
- Refactor gensparkPlaywright.js to use ChromeSessionManager (receives page, no longer manages browser lifecycle)
- Extract gensparkSelectors.js (selector definitions + findElement)
- Extract gensparkRateLimiter.js (rate limiting logic)
- Extract gensparkState.js (generation state persistence)
- React-safe prompt injection (native value setter trick)
- Improved selector fallbacks (remove Playwright syntax, add XPath)

**Uses:** puppeteer-core (via ChromeSessionManager), CDP Page API

**Implements:** GensparkAutomation component (refactored), extracted modules

**Addresses:** Table stakes feature "Resilient element discovery", prevents Pitfall #4 (React input rejection)

**Avoids:** Breaking existing functionality by keeping refactoring behavior-preserving. Each extraction is testable independently.

### Phase 3: Network-Based Image Detection
**Rationale:** After automation logic is stable and modular, replace DOM polling with network interception. This is the #2 stated problem (slow/fragile detection). Depends on stable CDP session from Phase 1.

**Delivers:**
- CDP network response monitoring via `page.on('response')`
- Image filtering by content-type + size threshold
- Network-based image buffer capture
- DOM polling as fallback
- Per-image streaming progress events (prompt_injected, request_sent, image_downloading, image_saved)

**Uses:** CDP Network domain (`Network.responseReceived`, `Network.getResponseBody`), CDP Fetch domain (optional, for active interception)

**Implements:** Network interception pattern (Pattern 3 from ARCHITECTURE.md)

**Addresses:** Table stakes feature "Network-based image detection", should-have feature "Per-image streaming progress", prevents Pitfall #5 (blob URL failures)

**Avoids:** Request interception pitfalls (service workers, hanging requests) by using passive monitoring as primary approach.

### Phase 4: Model Selection & Configuration
**Rationale:** With core automation working reliably via network detection, add missing feature (model selection). Uses the selector fallback system established in Phase 2.

**Delivers:**
- Model selection via UI interaction (find dropdown, expand, match text, click)
- Config object extension (`config.model`, `config.autoPrompt`)
- Auto-prompt enhancement toggle (make existing `disableAutoPrompt()` configurable)
- Aspect ratio configuration via UI (click settings, select option)

**Uses:** Selector fallback chains from gensparkSelectors.js

**Implements:** Model selection component logic

**Addresses:** Table stakes feature "Model selection (Nano Banana Pro)", should-have feature "Auto-prompt enhancement toggle"

**Avoids:** API interception approach (defer to v2). UI-based approach is more resilient to API changes.

### Phase 5: Enhanced Rate Limiting & State Management
**Rationale:** After core features work, improve reliability for large batches. Rate limiting enhancements depend on network monitoring from Phase 3 (detect HTTP 429). State enhancements enable better resume behavior.

**Delivers:**
- Adaptive rate limiting (detect HTTP 429, parse Retry-After header, exponential backoff)
- Per-prompt state tracking (`status`, `imagePath`, `error`, `attempts`)
- Resume with per-prompt granularity (retry failed, skip succeeded)
- Selector health monitoring (log success/failure, sort by historical rate)

**Uses:** CDP network responses (for 429 detection), enhanced gensparkState.js

**Implements:** Adaptive rate limiter, enhanced state persistence

**Addresses:** Should-have features "Adaptive rate limiting", "Batch resume per-prompt granularity", "Selector health monitoring"

**Avoids:** Memory leaks by cleaning up listeners (patterns from Phase 1). Rate limiting prevents ban escalation.

### Phase Ordering Rationale

- **Phase 1 first because:** Session management is foundational. It has no dependencies, can be tested independently, and all subsequent phases require a stable CDP connection. Solving cookie preservation (the #1 problem) immediately provides user value.

- **Phase 2 before Phase 3 because:** Network interception requires a clean architecture. Extracting selectors, rate limiter, and state into separate modules makes Phase 3 easier to integrate without further monolith surgery. React input injection is needed regardless of detection method.

- **Phase 3 before Phase 4 because:** Network-based detection must be stable before adding model selection. Model selection's success depends on reliable image capture to verify the selected model produces expected results.

- **Phase 5 last because:** Enhanced rate limiting and state management are optimizations. They improve large batch reliability but are not blocking for basic use cases. HTTP 429 detection requires network monitoring from Phase 3.

- **Dependencies:** Phase 1 → Phase 2 (automation needs session) → Phase 3 (network detection needs refactored automation) → Phase 4 (model selection needs working image capture) → Phase 5 (adaptive rate limiting needs 429 detection from Phase 3).

- **Avoids pitfalls:** Starting with session management prevents rework. Memory leak patterns established in Phase 1 carry through. React input handling (Phase 2) avoids silent failures before adding complexity.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3 (Network-Based Image Detection):** Genspark's image serving mechanism is unverified. Need to examine actual network traffic during generation to confirm content-type headers, URL patterns, and response structure. May need to reverse-engineer API response shape for completion detection. Research during phase planning via browser DevTools network tab inspection.

- **Phase 4 (Model Selection):** Genspark's model selector UI structure is unverified. Need to inspect DOM during phase planning to discover exact selectors (aria-label, data-testid, role attributes) for dropdown and options. Selector patterns are known (fallback chains), but specific values require reconnaissance.

Phases with standard patterns (skip research-phase):

- **Phase 1 (CDP Session Management):** Well-documented pattern in Puppeteer official docs and GitHub issues. Chrome debug port discovery, WebSocket connection, and reconnection handling are established practices. No domain-specific research needed.

- **Phase 2 (Core Refactoring):** Extraction and React input handling are general software engineering patterns. Native value setter trick is documented in React issue #10135. No new research needed.

- **Phase 5 (Rate Limiting & State):** HTTP 429 detection and exponential backoff are standard patterns. State persistence is extension of existing approach. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Puppeteer docs, CDP spec, verified versions. puppeteer-core connect() approach is well-documented with multiple sources. |
| Features | HIGH | Derived from existing codebase analysis (gensparkPlaywright.js 1465 lines), official Puppeteer docs, and stated project requirements. MVP feature set is clear. |
| Architecture | HIGH | Component separation (ChromeSessionManager, GensparkAutomation) follows standard facade pattern. IPC patterns verified in Electron official docs. Build order respects dependencies. |
| Pitfalls | HIGH | All critical pitfalls verified against official GitHub issues (Puppeteer #10666, #5043, #5331, React #10135) or official docs. Prevention strategies are tested patterns from community. |

**Overall confidence:** HIGH

Research is based on official documentation (Puppeteer, CDP spec, Electron, React), verified GitHub issues with maintainer responses, and direct codebase analysis. The CDP connection approach is proven in production systems. Key uncertainties (Genspark's specific image serving, selector values) are flagged for phase-specific research.

### Gaps to Address

Areas where research was inconclusive or needs validation during implementation:

- **Genspark's image serving mechanism:** Research assumes images are served as standard HTTP responses with `content-type: image/*` headers. May use blob URLs (documented workaround exists), data URLs, or progressive loading. Verify during Phase 3 planning by inspecting network traffic in browser DevTools.

- **Genspark's model selector UI structure:** Research assumes a standard dropdown/radio group with aria-label or data-testid attributes. May use custom React components with non-standard selector patterns. Verify during Phase 4 planning by inspecting DOM in browser DevTools. Fallback chain pattern handles variation.

- **Genspark's bot detection specifics:** Research covers general anti-bot techniques (webdriver flag, CDP detection, behavioral analysis). Unknown if Genspark uses Cloudflare, DataDome, or custom detection. Connecting to user's real Chrome mitigates most vectors, but monitor for CAPTCHA/blocking during testing.

- **Service worker caching strategy:** Research notes Genspark may use service workers that bypass network interception. Workaround is `Network.setBypassServiceWorker`. Unknown if Genspark actually uses service workers or their caching scope. Verify during Phase 3 implementation. If bypass is insufficient, may need to disable service workers entirely via Chrome flag.

- **Profile lock behavior on Windows:** Current code has `cleanupStaleLocks()` (line 473 of gensparkPlaywright.js). Research confirms CDP connection eliminates lock conflicts by attaching to already-running Chrome. Verify that launching Chrome with `--remote-debugging-port` + `--user-data-dir` when Chrome is closed does not create lock conflicts on Windows. Test during Phase 1 implementation.

## Sources

### Primary (HIGH confidence)
- [Puppeteer Browser Management docs](https://pptr.dev/guides/browser-management) — connect() vs launch(), disconnect() vs close()
- [Puppeteer Network Interception docs](https://pptr.dev/guides/network-interception) — response interception, request handling
- [CDP Network domain specification](https://chromedevtools.github.io/devtools-protocol/tot/Network/) — Network.responseReceived, Network.getResponseBody
- [CDP Fetch domain specification](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/) — Fetch.enable, Fetch.requestPaused, active interception
- [CDPSession API - pptr.dev](https://pptr.dev/api/puppeteer.cdpsession) — createCDPSession, detach
- [Puppeteer connect() API](https://pptr.dev/api/puppeteer.puppeteer.connect) — browserURL, browserWSEndpoint, defaultViewport
- [Electron IPC tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc) — ipcMain.handle/on, ipcRenderer.invoke/on
- [Puppeteer #10666](https://github.com/puppeteer/puppeteer/issues/10666) — userDataDir cookie persistence issues
- [Puppeteer #5043](https://github.com/puppeteer/puppeteer/issues/5043) — CDP event handler memory leaks
- [Puppeteer #5331](https://github.com/puppeteer/puppeteer/issues/5331) — browser.close() hangs on WebSocket loss
- [React #10135](https://github.com/facebook/react/issues/10135) — dispatchEvent on input/textarea ignored by controlled components

### Secondary (MEDIUM confidence)
- [Connecting Puppeteer to existing Chrome](https://medium.com/@jaredpotter1/connecting-puppeteer-to-existing-chrome-window-8a10828149e0) — community article, verified patterns against official docs
- [Puppeteer Network Response Analysis](https://latenode.com/blog/web-automation-scraping/puppeteer-fundamentals-setup/network-response-analysis-and-processing-in-puppeteer-monitoring-and-modification) — tutorial, verified patterns
- [Apify Academy: Reading & Intercepting Requests](https://docs.apify.com/academy/puppeteer-playwright/reading-intercepting-requests) — reputable source, verified patterns
- [Browserless: Cookie and Session Management](https://www.browserless.io/blog/manage-sessions) — industry source
- [puppeteer-extra stealth plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) — npm package, verified compatibility
- [puppeteer-extra issue #513](https://github.com/berstend/puppeteer-extra/issues/513) — stealth with connect() compatibility
- [Puppeteer #3722](https://github.com/puppeteer/puppeteer/issues/3722) — Cannot return blob/ArrayBuffer from evaluate
- [Puppeteer #4208](https://github.com/puppeteer/puppeteer/issues/4208) — Request interception blocks web workers
- [Puppeteer #4860](https://github.com/puppeteer/puppeteer/issues/4860) — Chrome profile locking
- [Puppeteer #3543](https://github.com/puppeteer/puppeteer/issues/3543) — Using existing Chrome
- [Cory Rylan: React Controlled Inputs](https://coryrylan.com/blog/trigger-input-updates-with-react-controlled-inputs) — community, verified against React issue
- [XPath vs CSS Selectors in 2025](https://rebrowser.net/blog/xpath-vs-css-selectors-a-comprehensive-guide-for-web-automation-and-testing) — industry analysis
- [Genspark.ai Image Generation](https://www.genspark.ai/agents?type=image_generation_agent) — official site

### Tertiary (LOW confidence)
- [puppeteer-extra #899](https://github.com/berstend/puppeteer-extra/issues/899) — CDP protocol detection, needs validation for Genspark specifically
- [Rate Limiting with Exponential Backoff](https://substack.thewebscraping.club/p/rate-limit-scraping-exponential-backoff) — community best practices, general pattern
- [Puppeteer Memory Leak Journey](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367) — anecdotal, but patterns verified elsewhere

---
*Research completed: 2026-02-16*
*Ready for roadmap: yes*
