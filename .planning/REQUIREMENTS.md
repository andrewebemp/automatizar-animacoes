# Requirements: Automatizar Animacoes — Genspark Browser Automation

**Defined:** 2026-02-16
**Core Value:** Reliable, hands-free image generation through Genspark using the user's existing Chrome session and free Nano Banana Pro model, without losing Google login or requiring manual intervention.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Session Management

- [ ] **SESS-01**: App connects to user's existing Chrome via CDP (`puppeteer-core.connect()`) preserving all cookies and Google login
- [ ] **SESS-02**: App launches Chrome with `--remote-debugging-port` when no running Chrome is detected
- [ ] **SESS-03**: App uses `browser.disconnect()` (not `browser.close()`) when connected to user's Chrome
- [ ] **SESS-04**: App detects Chrome WebSocket disconnection and attempts reconnection (max 3 retries)
- [ ] **SESS-05**: ChromeSessionManager is a separate module with clear lifecycle API (connect, getPage, dispose)
- [ ] **SESS-06**: App detects Google login status on Genspark page after connection

### Image Detection

- [ ] **IMGD-01**: Images detected via CDP network response monitoring (`Network.responseReceived`) instead of DOM polling
- [ ] **IMGD-02**: Image responses filtered by content-type (`image/*`) and size threshold (>50KB) to exclude avatars/icons
- [ ] **IMGD-03**: Image buffer retrieved via `Network.getResponseBody` (base64 decode for binary)
- [ ] **IMGD-04**: DOM polling retained as fallback when network interception fails
- [ ] **IMGD-05**: Downloaded image validated as valid PNG/JPEG before saving

### Resilient Selectors

- [ ] **SELC-01**: No hardcoded CSS selectors for Genspark UI elements
- [ ] **SELC-02**: Selector discovery uses fallback chain: ARIA > role > data-testid > XPath text > CSS structural
- [ ] **SELC-03**: Discovered selectors cached locally with 24h TTL auto-invalidation
- [ ] **SELC-04**: Textarea discovered with at least 2 independent strategies
- [ ] **SELC-05**: Submit button discovered with at least 2 independent strategies

### Model Selection

- [ ] **MODL-01**: Nano Banana Pro model auto-selected when available in model selector
- [ ] **MODL-02**: Already-selected model detected without reopening selector (avoid unnecessary clicks)
- [ ] **MODL-03**: Model name and free status reported to UI via IPC
- [ ] **MODL-04**: Graceful fallback when model selector not found (use default model)

### Automation Core

- [ ] **AUTO-01**: Prompt injection uses React-safe native value setter (bypasses React controlled component interception)
- [ ] **AUTO-02**: Prompt value verified in textarea after injection (retry if empty)
- [ ] **AUTO-03**: Rate limiting enforces min 3s between requests and max 10 requests/minute
- [ ] **AUTO-04**: Generation state persisted per-prompt for resume after crash/cancel
- [ ] **AUTO-05**: Cancel operation stops cleanly without orphan Chrome processes or hanging CDP sessions

### IPC & Progress

- [ ] **IPC-01**: IPC channels use `genspark:` prefix namespace for all automation events
- [ ] **IPC-02**: Real-time progress streamed via `webContents.send()` (not polling)
- [ ] **IPC-03**: Per-image lifecycle events: prompt_injected, generating, image_detected, image_saved
- [ ] **IPC-04**: Error messages are user-friendly and in Portuguese

### UI Improvements

- [ ] **UX-01**: Google Chrome profile auto-detected by email (andrewebemp@gmail.com)
- [ ] **UX-02**: Nano Banana Pro model badge displayed with "Gratuito" label
- [ ] **UX-03**: Auto-import triggered after image generation completes
- [ ] **UX-04**: Simplified configuration (model + output folder, no Chrome path needed when connecting)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Rate Limiting

- **RATE-01**: HTTP 429 status detected from network responses with `Retry-After` header parsing
- **RATE-02**: Exponential backoff with jitter on rate limit detection
- **RATE-03**: Adaptive throttling (increase rate on success, decrease on failure)

### Advanced State Management

- **STAT-01**: Per-prompt status tracking (pending, generating, succeeded, failed, skipped)
- **STAT-02**: Resume generates only failed/pending prompts, skipping succeeded ones
- **STAT-03**: Retry count per prompt with configurable max attempts

### Monitoring & Diagnostics

- **DIAG-01**: Selector health monitoring (log which fallback strategies succeed/fail)
- **DIAG-02**: Memory usage monitoring with warnings at thresholds
- **DIAG-03**: CDP session reconnection counting per batch

### Stealth & Anti-Detection

- **STLT-01**: puppeteer-extra-plugin-stealth integration for launch() fallback path
- **STLT-02**: Human-like typing with variable delays (30-110ms per character)

### Performance

- **PERF-01**: CDP response body streaming (`Fetch.takeResponseBodyAsStream`) for large batches
- **PERF-02**: Network-based generation completion detection (watch API response, not DOM)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full Playwright migration | Already migrated to Puppeteer; churn with no net benefit. CDP connect works with either. |
| Headless mode | Defeats purpose of session preservation; triggers bot detection; user needs visual feedback |
| Parallel multi-tab generation | Rate limits per-account, not per-tab; multiple tabs trigger bans faster; complex error recovery |
| Cookie export/import | Google session cookies are device-bound with DPAPI encryption; CDP connect makes this unnecessary |
| Proxy rotation | Rate limits by account, not IP; adds latency and complexity with no benefit |
| Screenshot-based visual AI | Massive complexity for a known website; selector fallback chains are faster and more reliable |
| Direct Genspark API bypass | No public API; reverse-engineering is brittle and may violate ToS |
| Multi-user/cloud deployment | Single-user desktop app — design constraint |
| Paid model support | Using free Nano Banana Pro only — budget constraint |
| Other services (not Genspark) | Squad scope limited to Genspark automation |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SESS-01 | Phase 1 | Pending |
| SESS-02 | Phase 1 | Pending |
| SESS-03 | Phase 1 | Pending |
| SESS-04 | Phase 1 | Pending |
| SESS-05 | Phase 1 | Pending |
| SESS-06 | Phase 1 | Pending |
| AUTO-01 | Phase 2 | Pending |
| AUTO-02 | Phase 2 | Pending |
| AUTO-05 | Phase 2 | Pending |
| SELC-01 | Phase 2 | Pending |
| SELC-02 | Phase 2 | Pending |
| SELC-03 | Phase 2 | Pending |
| SELC-04 | Phase 2 | Pending |
| SELC-05 | Phase 2 | Pending |
| IMGD-01 | Phase 3 | Pending |
| IMGD-02 | Phase 3 | Pending |
| IMGD-03 | Phase 3 | Pending |
| IMGD-04 | Phase 3 | Pending |
| IMGD-05 | Phase 3 | Pending |
| IPC-01 | Phase 3 | Pending |
| IPC-02 | Phase 3 | Pending |
| IPC-03 | Phase 3 | Pending |
| IPC-04 | Phase 3 | Pending |
| MODL-01 | Phase 4 | Pending |
| MODL-02 | Phase 4 | Pending |
| MODL-03 | Phase 4 | Pending |
| MODL-04 | Phase 4 | Pending |
| AUTO-03 | Phase 5 | Pending |
| AUTO-04 | Phase 5 | Pending |
| UX-01 | Phase 5 | Pending |
| UX-02 | Phase 5 | Pending |
| UX-03 | Phase 5 | Pending |
| UX-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after initial definition*
