# Roadmap: Automatizar Animacoes - Genspark Browser Automation

## Overview

This milestone migrates Genspark browser automation from fragile Puppeteer-launch to CDP-connected automation that preserves the user's Google login, detects images via network interception, and auto-selects the free Nano Banana Pro model. The 5 phases progress from session foundation through core refactoring, network-based detection, model configuration, and finally rate limiting with UX polish. Each phase delivers a coherent, testable capability that builds on the previous one.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: CDP Session Management** - Connect to user's Chrome preserving cookies and login state
- [ ] **Phase 2: Core Automation Refactoring** - Extract monolith into focused modules with resilient selectors and React-safe input
- [ ] **Phase 3: Network-Based Image Detection** - Replace DOM polling with CDP network interception and streaming progress
- [ ] **Phase 4: Model Selection** - Auto-select Nano Banana Pro with graceful fallback
- [ ] **Phase 5: Rate Limiting & UX Polish** - Enforce rate limits, persist state, and simplify user configuration

## Phase Details

### Phase 1: CDP Session Management
**Goal**: User's existing Chrome session is preserved across automation runs -- no more lost Google logins or manual re-authentication
**Depends on**: Nothing (foundation phase)
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06
**Research flags**: None. CDP connection is a well-documented Puppeteer pattern. No domain-specific research needed.
**Success Criteria** (what must be TRUE):
  1. User launches automation and their existing Chrome tabs, cookies, and Google login remain intact throughout and after the session
  2. When no Chrome is running, the app launches Chrome with the correct debug port and the user's profile
  3. App disconnects cleanly (never closes the user's Chrome) when automation completes or is cancelled
  4. When Chrome's WebSocket connection drops mid-session, the app reconnects automatically (up to 3 retries) without losing progress
  5. ChromeSessionManager exposes a clear lifecycle API (connect, getPage, dispose) as a standalone module separate from automation logic
**Plans**: TBD

Plans:
- [ ] 01-01: ChromeSessionManager module with CDP connect, launch fallback, and disconnect
- [ ] 01-02: Reconnection handling and login status detection

### Phase 2: Core Automation Refactoring
**Goal**: The 1465-line monolith is decomposed into focused modules, selectors survive Genspark UI changes, and prompt injection works reliably with React controlled inputs
**Depends on**: Phase 1 (automation receives page from ChromeSessionManager)
**Requirements**: AUTO-01, AUTO-02, AUTO-05, SELC-01, SELC-02, SELC-03, SELC-04, SELC-05
**Research flags**: None. Module extraction and React native value setter trick are standard engineering patterns.
**Success Criteria** (what must be TRUE):
  1. Prompts are injected into the Genspark textarea and React state reflects the injected value (verified by reading back the textarea content after injection)
  2. No CSS selector strings are hardcoded in automation code -- all element discovery uses fallback chains (ARIA > role > data-testid > XPath > CSS structural)
  3. Discovered selectors are cached locally and auto-invalidate after 24 hours
  4. Both the textarea and submit button are discoverable via at least 2 independent strategies each
  5. Cancelling automation stops cleanly with no orphan Chrome processes or hanging CDP sessions
**Plans**: TBD

Plans:
- [ ] 02-01: Extract gensparkSelectors.js with fallback chain discovery and caching
- [ ] 02-02: Extract GensparkAutomation with React-safe prompt injection and clean cancellation

### Phase 3: Network-Based Image Detection
**Goal**: Generated images are captured instantly via network interception instead of slow DOM polling, with real-time per-image progress streamed to the UI
**Depends on**: Phase 2 (needs refactored automation module and stable selectors)
**Requirements**: IMGD-01, IMGD-02, IMGD-03, IMGD-04, IMGD-05, IPC-01, IPC-02, IPC-03, IPC-04
**Research flags**: YES. Genspark's image serving mechanism is unverified. Need to inspect actual network traffic during generation to confirm content-type headers, URL patterns, response structure, and whether images use blob URLs or standard HTTP responses. Research via browser DevTools network tab during phase planning.
**Success Criteria** (what must be TRUE):
  1. Images are detected and captured the moment they appear in network traffic, without waiting for DOM render or polling intervals
  2. Only actual generated images are captured (avatars, icons, and thumbnails under 50KB are filtered out)
  3. When network interception fails (service worker interference, unexpected response format), DOM polling kicks in as fallback without user intervention
  4. Each image's lifecycle is visible in the UI in real time: prompt injected, generating, image detected, image saved
  5. All error messages displayed to the user are in Portuguese and describe the problem in user-friendly terms
**Plans**: TBD

Plans:
- [ ] 03-01: CDP network response monitoring with content-type filtering and image validation
- [ ] 03-02: IPC streaming progress with per-image lifecycle events and DOM polling fallback

### Phase 4: Model Selection
**Goal**: The free Nano Banana Pro model is automatically selected before generation, with its status visible in the UI
**Depends on**: Phase 3 (model selection success is verified by image capture working correctly)
**Requirements**: MODL-01, MODL-02, MODL-03, MODL-04
**Research flags**: YES. Genspark's model selector UI structure is unverified. Need to inspect DOM during phase planning to discover exact selectors (aria-label, data-testid, role attributes) for the dropdown and options. Fallback chain pattern from Phase 2 handles variation, but specific values require reconnaissance.
**Success Criteria** (what must be TRUE):
  1. When the user starts generation, Nano Banana Pro is automatically selected in the model dropdown without manual intervention
  2. If Nano Banana Pro is already selected, the app does not reopen the model selector (no unnecessary UI clicks)
  3. The currently selected model name and its free status are reported back to the UI via IPC
  4. When the model selector cannot be found (Genspark UI change), generation proceeds with the default model and the user is notified
**Plans**: TBD

Plans:
- [ ] 04-01: Model selector discovery, auto-selection, and IPC model status reporting

### Phase 5: Rate Limiting & UX Polish
**Goal**: Large batches run reliably with enforced rate limits and crash-resistant state, while the UI is simplified so the user only configures model and output folder
**Depends on**: Phase 4 (all core automation features must work before polishing reliability and UX)
**Requirements**: AUTO-03, AUTO-04, UX-01, UX-02, UX-03, UX-04
**Research flags**: None. Rate limiting and state persistence are standard patterns. UI changes are within existing React component.
**Success Criteria** (what must be TRUE):
  1. Requests are throttled to minimum 3 seconds apart and maximum 10 per minute, even when the user submits a large batch
  2. If the app crashes or the user cancels mid-batch, resuming picks up from the last incomplete prompt (already-generated images are not re-requested)
  3. The user's Google Chrome profile is auto-detected by email (andrewebemp@gmail.com) without requiring manual Chrome path configuration
  4. The Nano Banana Pro model badge displays with a "Gratuito" label in the UI
  5. After all images in a batch are generated, auto-import into the project triggers without manual intervention
**Plans**: TBD

Plans:
- [ ] 05-01: Rate limiting enforcement and generation state persistence with crash recovery
- [ ] 05-02: Chrome profile auto-detection, model badge, auto-import, and simplified config UI

## Coverage

**Requirement-to-Phase Mapping (33/33 mapped):**

| Category | Requirements | Phase | Count |
|----------|-------------|-------|-------|
| Session Management | SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06 | 1 | 6 |
| Resilient Selectors | SELC-01, SELC-02, SELC-03, SELC-04, SELC-05 | 2 | 5 |
| Automation Core (input/cancel) | AUTO-01, AUTO-02, AUTO-05 | 2 | 3 |
| Image Detection | IMGD-01, IMGD-02, IMGD-03, IMGD-04, IMGD-05 | 3 | 5 |
| IPC & Progress | IPC-01, IPC-02, IPC-03, IPC-04 | 3 | 4 |
| Model Selection | MODL-01, MODL-02, MODL-03, MODL-04 | 4 | 4 |
| Automation Core (rate/state) | AUTO-03, AUTO-04 | 5 | 2 |
| UI Improvements | UX-01, UX-02, UX-03, UX-04 | 5 | 4 |

**Totals:** 33 requirements mapped, 0 orphaned, 0 duplicated.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 --> 2 --> 3 --> 4 --> 5

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. CDP Session Management | 0/2 | Not started | - |
| 2. Core Automation Refactoring | 0/2 | Not started | - |
| 3. Network-Based Image Detection | 0/2 | Not started | - |
| 4. Model Selection | 0/1 | Not started | - |
| 5. Rate Limiting & UX Polish | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-16*
*Last updated: 2026-02-16*
