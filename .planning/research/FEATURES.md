# Feature Research

**Domain:** Chrome browser automation for AI image generation (Genspark.ai)
**Researched:** 2026-02-16
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features the automation must have or it simply does not work reliably.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **CDP session attach to user's Chrome** | The core problem: `puppeteer.launch()` creates a fresh browser losing Google login cookies. Users must be logged into Genspark with their own Google account. Connecting to an existing Chrome instance via `--remote-debugging-port` with `puppeteer-core.connect()` preserves all cookies, extensions, and session state. | MEDIUM | Launch Chrome with `--remote-debugging-port=9222 --user-data-dir=<existing-profile>`, fetch `http://localhost:9222/json/version` for `webSocketDebuggerUrl`, then `puppeteer.connect({ browserWSEndpoint })`. Must handle "profile already in use" by detecting lock files. Current code already manages lock cleanup -- extend that pattern. |
| **Network-based image detection** | Current DOM polling (`page.$$eval('img', ...)` in a `while` loop every 1s) is slow and fragile. It misses blob URLs, races against lazy loading, and breaks when Genspark changes CSS classes. CDP network events (`Network.responseReceived` + `Network.getResponseBody`, or `Fetch.requestPaused` at the response stage) detect images the instant they arrive, by content-type header, before they even render in the DOM. | MEDIUM | Use `page.on('response')` filtering `response.headers()['content-type'].includes('image')` and `response.url()` patterns for Genspark's image CDN. Alternatively, use CDP `Fetch.enable` with `requestStage: 'Response'` and resource type `Image` patterns. The `response.buffer()` call retrieves the image bytes directly -- no need for the current canvas-based `downloadImage()` workaround for blob URLs. |
| **Resilient element discovery with fallback chains** | Genspark updates its UI regularly. Hardcoded CSS selectors like `textarea[data-testid="prompt-input"]` break. The current code already has a `SELECTORS` object with fallback arrays -- this pattern is correct but needs strengthening. | MEDIUM | Current implementation is decent but filters out `:has-text`, `:near` selectors (Playwright-only syntax left over from migration). Improve by: (1) prioritizing `[data-testid]` and `[aria-label]` attributes, (2) adding XPath fallbacks for text-content matching (Puppeteer supports `page.$x()`), (3) adding a "self-healing" layer that logs which selector succeeded so future runs try the working one first. |
| **Client-side rate limiting with adaptive backoff** | Genspark will throttle or block rapid automated requests. Without rate limiting, the automation gets banned and all prompts fail. Current code has basic rate limiting (10 req/min, 1min cooldown) but it is naive -- it does not adapt to actual server responses. | LOW | Enhance existing `RATE_LIMIT_CONFIG` with: (1) HTTP 429 status detection from network responses, (2) `Retry-After` header parsing, (3) exponential backoff with jitter (current `withRetry` already does this -- wire it to actual 429 detection). (4) Adaptive throttling: if requests consistently succeed, slowly increase rate; if any fail, decrease. |
| **Model selection (Nano Banana Pro, GPT Image, FLUX, Seedream)** | Genspark offers multiple image generation models. The current automation has no model selection at all -- it uses whatever default is active. Users need to choose the model that matches their quality/speed requirements. Nano Banana Pro is specifically called out in the project requirements. | MEDIUM | Genspark's model selector is typically a dropdown or radio group in the UI. Strategy: (1) find model selector element via aria-label or data-testid, (2) click to expand options, (3) find option by text content matching model name, (4) click to select. Add model name to the config object passed to `generateImages()`. The selector fallback chain pattern already in the codebase applies here. |
| **Graceful browser lifecycle management** | Current code calls `browser.close()` in `finally` block, killing the entire Chrome instance. When connecting to the user's own Chrome (the new approach), calling `browser.close()` would close ALL their browser tabs. Must only close/detach the automation pages, not the browser. | LOW | When using `puppeteer.connect()`, call `browser.disconnect()` instead of `browser.close()`. Only close pages the automation created. Track which pages are "ours" vs pre-existing. |
| **Per-image streaming progress to renderer** | Current architecture sends progress via IPC (`mainWindow.webContents.send('genspark-progress', data)`) but only at coarse granularity (generating/completed/error). Users need to see: which prompt is being processed, when the image request was sent, when the network response started arriving, when the image was fully downloaded. | LOW | Extend the existing `onProgress` callback with finer-grained status values: `'prompt_injected'`, `'request_sent'`, `'image_response_started'`, `'image_downloading'`, `'image_saved'`. The network interception naturally provides these lifecycle events. Wire CDP network events to progress callbacks via the existing IPC channel. |

### Differentiators (Competitive Advantage)

Features that make this automation notably better than manual use or competing tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Auto-prompt enhancement toggle** | Genspark has an "Auto Prompt" feature that rewrites user prompts. Current code tries to disable it but uses fragile selectors. Making this a configurable toggle (enable/disable per batch) gives users control. Some prompts benefit from enhancement, others need exact text. | LOW | Already partially implemented in `disableAutoPrompt()`. Make it a config option: `config.autoPrompt = true/false`. Improve selector resilience using the same fallback chain pattern. |
| **Network-based generation completion detection** | Instead of polling the DOM for new `<img>` tags, watch for the specific API call Genspark makes when generation is complete. This is faster and more reliable than image polling because you catch the exact moment the backend returns a result, including error responses. | MEDIUM | Use `page.on('response')` to watch for Genspark's internal API endpoint (likely a POST to their generation API). When the response arrives with a success status and image URL, immediately download. Requires reverse-engineering Genspark's API response shape -- examine network tab once during development. This is the key differentiator over DOM polling. |
| **Aspect ratio configuration via API interception** | Instead of clicking through UI settings menus (fragile), intercept the API request that includes aspect ratio parameters and modify it directly. This bypasses the UI entirely for configuration. | HIGH | Requires understanding Genspark's API request format. Use `Fetch.enable` to intercept the generation request, modify the body to include desired aspect ratio, then `Fetch.continueRequest`. This is significantly more resilient than clicking config buttons but requires Genspark API reverse engineering. Start with UI-based approach, migrate to API interception later. |
| **Selector health monitoring and auto-repair** | Log which selectors in each fallback chain succeed vs fail. When a selector that previously worked starts failing, alert the user that Genspark may have updated their UI. Optionally, auto-detect the new selector by searching for elements with similar attributes near the expected DOM position. | MEDIUM | Build a `SelectorHealth` module that persists selector success/failure counts to the app's state file (existing `getStatePath()` pattern). On startup, sort fallback chains by historical success rate. When all selectors fail, emit a diagnostic event so the UI can show "Genspark may have changed their layout -- please report this." |
| **Batch resume with per-prompt granularity** | Current code has basic state persistence for resuming (saves `completedCount`). Enhance to track per-prompt status: pending, in-progress, succeeded, failed, skipped. On resume, retry only failed prompts, skip succeeded ones, respect original ordering. | LOW | Extend existing `saveGenerationState()` to include a per-prompt status array: `[{ prompt, status, imagePath, error, attempts }]`. On resume, filter to only pending/failed prompts. Already have the infrastructure -- just needs richer state shape. |
| **CDP response body streaming for large images** | Instead of buffering entire image responses in memory, use `Fetch.takeResponseBodyAsStream` to stream image data directly to disk. Reduces memory pressure when generating many high-resolution images in batch. | MEDIUM | Use CDP `IO.read` to stream from the handle returned by `Fetch.takeResponseBodyAsStream`. Write chunks directly to a `fs.createWriteStream`. Only matters for very large batches (50+ images) or very high resolution outputs. |
| **Stealth mode with anti-detection** | Genspark may detect automated browsers. Use `puppeteer-extra-plugin-stealth` evasion modules to hide automation markers (navigator.webdriver, chrome.runtime, etc.). The current code already sets a custom user agent and disables `--enable-automation` flag -- but more evasions exist. | LOW | Add `puppeteer-extra` and `puppeteer-extra-plugin-stealth` as dependencies. These work with `puppeteer-core` via `addExtra()`. Apply the 17 built-in evasion modules. Note: when connecting to user's real Chrome (the new session approach), most automation markers are already absent because it is a real browser. Stealth plugin is more important for the `launch()` fallback path. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem useful but create more problems than they solve.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full Playwright migration** | Playwright has richer selectors (`:has-text`, `:near`, role-based locators), better auto-wait, and built-in network interception. | The project already migrated FROM Playwright TO Puppeteer (file is named `gensparkPlaywright.js` but uses `require('puppeteer')`). Migrating back creates churn. Playwright's `chromium.connectOverCDP()` is comparable to Puppeteer's `connect()`. The real benefit (session preservation) is achievable with either. More importantly, the Remotion renderer in the same project already uses Puppeteer for rendering -- having two browser automation libraries is unnecessary complexity. | Stay with Puppeteer. Use CDP directly for advanced features (network interception, element queries). Puppeteer's `page.$x()` provides XPath, and `page.$$eval` with custom logic provides text-content matching without Playwright. |
| **Headless mode for background generation** | Running Chrome visually takes resources. Headless would be "cleaner." | The entire point of connecting to the user's Chrome is session preservation. Headless Chrome cannot share the user's visual session. Also, Genspark likely has anti-bot measures that detect headless browsers. The user NEEDS to see the browser to solve CAPTCHAs, handle 2FA, or intervene when things go wrong. | Keep headed mode as default. If background execution is needed later, explore `--headless=new` with the dedicated app profile (not the user's Chrome), accepting that manual login will be required for that profile. |
| **Parallel multi-tab generation** | Current code has `processPromptsParallel` for multiple tabs. Seems like it should be faster. | Genspark's rate limiting is per-account, not per-tab. Multiple tabs hit the same rate limit faster, triggering bans sooner. Parallel tabs also increase memory usage and make error recovery harder (which tab failed? which page is in what state?). The current parallel implementation has a known issue: it does not configure aspect ratio or model per tab. | Use sequential processing as the reliable default. If parallelism is desired, limit to 2 tabs maximum with per-tab rate limiting and state tracking. The time saved from network-based image detection (instant vs 1s polling) more than compensates for sequential processing. |
| **Cookie export/import for session portability** | Save cookies from one machine and load them on another. | Google's session cookies use device-bound tokens and IP fingerprinting. Exported cookies frequently fail to authenticate on a different machine. Also creates security risk if cookie files are shared. The OAuth tokens have short lifetimes and refresh tokens are bound to the device. | Use `--remote-debugging-port` with the user's actual Chrome profile. Cookies are already there, managed by Chrome itself. No export/import needed. |
| **Proxy rotation for rate limit bypass** | Use multiple IP addresses to avoid rate limits. | Genspark rate limits by account, not IP. Proxy rotation does not help when using the same logged-in Google account. It also adds latency and complexity to every request, and most proxy services are unreliable for maintaining WebSocket connections needed by CDP. | Respect rate limits with adaptive backoff. If more throughput is needed, use multiple Genspark accounts (but this likely violates their ToS). |
| **Screenshot-based element detection (visual AI)** | Use AI vision to find buttons/inputs instead of selectors. | Massively increases complexity, adds AI inference latency per interaction (100ms+ per screenshot analysis), and requires an AI model dependency (local or API). For a known, specific website like Genspark, selector-based approaches with good fallback chains are faster and more reliable. | Use the selector fallback chain with XPath text-content matching as the resilience strategy. Reserve visual AI for future "generic website automation" if ever needed. |
| **Genspark API direct access (bypass browser)** | Skip the browser entirely, call Genspark's internal API directly. | Genspark does not have a public API. Their internal API likely requires session tokens that change frequently, are tied to browser fingerprints, and use anti-CSRF protections. Reverse-engineering a private API is brittle and may violate ToS. Any API change breaks everything with no UI fallback. | Use browser automation with network interception to OBSERVE API responses (for image detection), but always INITIATE actions through the UI (typing, clicking). This hybrid approach gets the reliability of API observation without the fragility of API-only access. |

## Feature Dependencies

```
CDP Session Attach to User Chrome
    |
    +--requires--> Chrome Launch with --remote-debugging-port
    |                  (Electron app must manage Chrome process lifecycle)
    |
    +--enables---> Network-based Image Detection
    |                  (CDP session needed for Fetch.enable / Network events)
    |
    +--enables---> Graceful Browser Lifecycle (disconnect vs close)
    |
    +--enables---> Per-image Streaming Progress
                       (network events provide lifecycle granularity)

Resilient Element Discovery
    |
    +--independent (no CDP dependency, works with any Puppeteer connection)
    |
    +--enables---> Model Selection (needs to find model selector elements)
    |
    +--enables---> Auto-prompt Toggle (needs to find toggle element)
    |
    +--enables---> Aspect Ratio Config via UI (needs to find config elements)

Network-based Image Detection
    |
    +--requires--> CDP Session Attach
    |
    +--enhances--> Batch Resume (instant detection = more reliable state)
    |
    +--enables---> Network-based Completion Detection (API response watching)
    |
    +--enables---> CDP Response Body Streaming

Rate Limiting
    |
    +--independent (works at application layer)
    |
    +--enhanced-by--> Network-based Detection (429 status codes from responses)

Selector Health Monitoring ----conflicts----> Overly Aggressive Auto-repair
    (monitoring is good; auto-rewriting selectors without human review is risky)
```

### Dependency Notes

- **CDP Session Attach is the foundation:** Network interception, streaming progress, and completion detection all require a CDP session. This must be Phase 1.
- **Resilient Element Discovery is independent:** Works with both `launch()` and `connect()` approaches. Can be improved in parallel with CDP work.
- **Network-based Image Detection requires CDP Session:** The `Fetch.enable` or `page.on('response')` approach only works after establishing a CDP connection. Build session management first, then network detection.
- **Model Selection requires Resilient Element Discovery:** Finding the model dropdown requires the same fallback chain pattern used for textarea and submit button. Improve element discovery first, then add model selection.
- **Rate Limiting is enhanced by Network Detection:** Basic rate limiting works standalone (current code), but detecting 429 responses from the network layer makes it adaptive. Can be built incrementally.
- **Selector Health Monitoring conflicts with auto-repair:** Monitoring (logging which selectors work) is safe. Auto-rewriting selectors without human review is risky -- a "repaired" selector might find the wrong element. Keep monitoring, defer auto-repair.

## MVP Definition

### Launch With (v1)

Minimum viable improvement -- what solves the critical problems.

- [ ] **CDP session attach to user's Chrome** -- Solves the #1 problem (lost login cookies). Uses `puppeteer-core.connect()` with `--remote-debugging-port`.
- [ ] **Graceful browser lifecycle** -- Required consequence of session attach. `disconnect()` instead of `close()`.
- [ ] **Network-based image detection** -- Solves #2 problem (slow/fragile DOM polling). Uses `page.on('response')` with content-type filtering.
- [ ] **Model selection** -- Solves #4 problem (no Nano Banana Pro selection). UI interaction via fallback selector chain.
- [ ] **Improved selector fallbacks** -- Solves #3 problem (hardcoded selectors). Add XPath text-content fallbacks, prioritize stable attributes.

### Add After Validation (v1.x)

Features to add once core is working and stable.

- [ ] **Adaptive rate limiting with 429 detection** -- Trigger: when users report getting blocked during batch generation
- [ ] **Per-image streaming progress** -- Trigger: when users request more detailed progress information
- [ ] **Network-based completion detection** -- Trigger: after reverse-engineering Genspark's API response shape during v1 development
- [ ] **Batch resume with per-prompt granularity** -- Trigger: when users run large batches (20+ prompts) and experience failures
- [ ] **Auto-prompt enhancement toggle** -- Trigger: when users report prompts being rewritten unexpectedly

### Future Consideration (v2+)

Features to defer until the automation is stable and well-tested.

- [ ] **Selector health monitoring** -- Defer because: requires usage data to be useful; build after selectors are stabilized
- [ ] **CDP response body streaming** -- Defer because: only matters for very large batches; standard buffering works fine for typical use
- [ ] **Aspect ratio via API interception** -- Defer because: requires reverse-engineering; UI-based approach works for now
- [ ] **Stealth plugin integration** -- Defer because: connecting to user's real Chrome already avoids most detection; only needed if Genspark actively blocks

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| CDP session attach to user's Chrome | HIGH | MEDIUM | P1 |
| Graceful browser lifecycle | HIGH | LOW | P1 |
| Network-based image detection | HIGH | MEDIUM | P1 |
| Improved selector fallbacks | HIGH | MEDIUM | P1 |
| Model selection (Nano Banana Pro) | HIGH | MEDIUM | P1 |
| Per-image streaming progress | MEDIUM | LOW | P2 |
| Adaptive rate limiting (429 detection) | MEDIUM | LOW | P2 |
| Network-based completion detection | MEDIUM | MEDIUM | P2 |
| Batch resume per-prompt granularity | MEDIUM | LOW | P2 |
| Auto-prompt toggle config | MEDIUM | LOW | P2 |
| Selector health monitoring | LOW | MEDIUM | P3 |
| CDP response streaming | LOW | MEDIUM | P3 |
| Aspect ratio via API interception | LOW | HIGH | P3 |
| Stealth plugin integration | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for this milestone. Directly addresses the 5 stated problems.
- P2: Should have. Improves reliability and UX once core works.
- P3: Nice to have. Optimization or future-proofing.

## Competitor Feature Analysis

| Feature | Manual browser use | Current app (Puppeteer launch) | Target (CDP connect + network) |
|---------|-------------------|-------------------------------|-------------------------------|
| Session preservation | Native (user's Chrome) | Broken (new profile each launch) | Fixed (connect to user's Chrome) |
| Image detection speed | Instant (visual) | Slow (1s DOM polling) | Instant (network events) |
| Selector resilience | N/A | Partial (fallback chains, but has Playwright syntax leftovers) | Strong (clean fallbacks + XPath + data-testid priority) |
| Model selection | Manual (click dropdown) | None | Automated (config-driven) |
| Rate limit handling | Manual (user waits) | Basic (fixed 10/min cap) | Adaptive (429 detection + backoff) |
| Batch progress | N/A | Coarse (generating/done) | Fine-grained (per-step network events) |
| Recovery on failure | Manual (refresh, retry) | Basic (retry + state file) | Enhanced (per-prompt status + auto-resume) |

## Sources

- [Puppeteer CDPSession API](https://pptr.dev/api/puppeteer.cdpsession) -- HIGH confidence (official docs)
- [Chrome DevTools Protocol - Fetch domain](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/) -- HIGH confidence (official spec)
- [Puppeteer Issue #3543: Use with existing Chrome](https://github.com/puppeteer/puppeteer/issues/3543) -- HIGH confidence (official repo)
- [Connecting Puppeteer to Existing Chrome Window](https://medium.com/@jaredpotter1/connecting-puppeteer-to-existing-chrome-window-8a10828149e0) -- MEDIUM confidence (community article, verified with official docs)
- [Puppeteer Network Response Analysis](https://latenode.com/blog/web-automation-scraping/puppeteer-fundamentals-setup/network-response-analysis-and-processing-in-puppeteer-monitoring-and-modification) -- MEDIUM confidence (tutorial, verified patterns against official docs)
- [Apify Academy: Reading & Intercepting Requests](https://docs.apify.com/academy/puppeteer-playwright/reading-intercepting-requests) -- MEDIUM confidence (reputable source)
- [Browserless: Cookie and Session Management](https://www.browserless.io/blog/manage-sessions) -- MEDIUM confidence (industry source)
- [Puppeteer Stealth Plugin](https://latenode.com/blog/web-automation-scraping/avoiding-bot-detection/invisible-automation-using-puppeteer-extra-plugin-stealth-to-bypass-bot-protection) -- MEDIUM confidence (community, verified against npm package)
- [Genspark.ai Image Generation](https://www.genspark.ai/agents?type=image_generation_agent) -- HIGH confidence (official site)
- [XPath vs CSS Selectors in 2025](https://rebrowser.net/blog/xpath-vs-css-selectors-a-comprehensive-guide-for-web-automation-and-testing) -- MEDIUM confidence (industry analysis)
- [Rate Limiting with Exponential Backoff](https://substack.thewebscraping.club/p/rate-limit-scraping-exponential-backoff) -- MEDIUM confidence (community best practices)
- [CDP Fetch.getResponseBody](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/) -- HIGH confidence (official spec)
- Existing codebase analysis: `electron/gensparkPlaywright.js`, `electron/main.js` -- HIGH confidence (direct source)

---
*Feature research for: Chrome browser automation for AI image generation (Genspark.ai)*
*Researched: 2026-02-16*
