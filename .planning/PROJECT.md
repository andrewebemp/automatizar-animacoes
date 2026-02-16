# Automatizar Animacoes - Genspark Browser Automation

## What This Is

Desktop application (Electron + React + Remotion) for creating animated whiteboard videos from subtitles and images. The current milestone focuses on improving the Genspark browser automation to generate images using the free Nano Banana Pro model via Chrome browser session, replacing the fragile Puppeteer-launch approach with CDP-connected, cookie-preserving automation.

## Core Value

Reliable, hands-free image generation through Genspark using the user's existing Chrome session and free Nano Banana Pro model, without losing Google login or requiring manual intervention.

## Requirements

### Validated

- ✓ SRT subtitle import and parsing — existing
- ✓ Multi-scene project creation from subtitles — existing
- ✓ Canvas-based region drawing (Konva) — existing
- ✓ Video rendering via Remotion (MP4 export) — existing
- ✓ Three project workflows (legacy, new-flow, timeline) — existing
- ✓ Audio waveform visualization (WaveSurfer) — existing
- ✓ Multi-format export (FCPXML, MLT, JSON) — existing
- ✓ AI prompt generation from subtitles — existing
- ✓ Genspark image generation via Puppeteer (basic) — existing
- ✓ Folder watching for image import — existing
- ✓ Chrome profile selection for Genspark — existing
- ✓ Rate limiting and state persistence for generation — existing
- ✓ Electron IPC bridge (electronAPI) — existing
- ✓ localStorage project persistence — existing

### Active

- [ ] CDP connection to existing Chrome (preserving Google login cookies)
- [ ] Resilient selector discovery (no hardcoded CSS selectors)
- [ ] Network intercept for image detection (replace DOM polling)
- [ ] Nano Banana Pro model auto-selection
- [ ] Chrome profile auto-detection by Google email
- [ ] ChromeSessionManager lifecycle module
- [ ] IPC streaming progress (real-time events)
- [ ] Improved GensparkStep UI (model badge, simplified config)

### Out of Scope

- API-based image generation (already exists as separate ApiPanel) — different approach
- Multi-user/cloud deployment — single-user desktop app
- Browser automation for services other than Genspark — squad scope limited
- Paid model support — using free Nano Banana Pro only
- Mobile/web version — Electron desktop only

## Context

**Target Account:** andrewebemp@gmail.com (Google account with free Nano Banana Pro access on Genspark)

**Current Problem:** The existing `gensparkPlaywright.js` (1465 lines) launches a NEW Chrome instance via Puppeteer, which loses the Google login cookies needed for Genspark authentication. Users must manually log in each time. CSS selectors are hardcoded and break when Genspark updates their UI. Image detection uses DOM polling instead of efficient network interception.

**Existing Code:**
- `electron/gensparkPlaywright.js` — Core Puppeteer automation (needs refactoring)
- `src/components/wizard-new/GensparkStep.tsx` — React component with PlaywrightPanel (needs UX improvements)
- `electron/main.js` — Electron main process (needs new IPC handlers)

**AIOS Squad:** `squads/genspark-browser-automation/` — 3 agents, 8 tasks, 1 workflow, 1 checklist defining the implementation approach

**Codebase Map:** `.planning/codebase/` — 7 documents analyzing current architecture, stack, conventions, concerns

## Constraints

- **Tech Stack**: Electron 28.3.3 + React 19 + Puppeteer 24.37.1 — must work within existing stack
- **Auth**: Browser cookies only (no API keys for Genspark) — security constraint
- **Language**: Portuguese for user-facing strings, English for code — project convention
- **Chrome**: Must connect to user's existing Chrome or launch with their profile — cookie preservation
- **Rate Limits**: Min 3s between requests, max 10/minute — Genspark fair usage
- **Module System**: CommonJS in Electron main process — existing convention

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CDP connect instead of Puppeteer launch | Preserves Google login cookies, avoids re-authentication | — Pending |
| Network intercept over DOM polling | More reliable image detection, catches images before DOM renders | — Pending |
| Discovery-based selectors with cache | Survives Genspark UI updates, auto-invalidates after 24h | — Pending |
| ChromeSessionManager as separate module | Clean separation of concerns, testable lifecycle management | — Pending |
| IPC streaming events instead of callbacks | Real-time progress without polling, cleaner architecture | — Pending |

---
*Last updated: 2026-02-16 after initialization*
