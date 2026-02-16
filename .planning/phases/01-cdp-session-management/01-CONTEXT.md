# Phase 1: CDP Session Management - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a CDP connection to the user's existing Chrome browser, preserving their Google login cookies and session state. Manage the full session lifecycle: discover Chrome, connect or launch, provide a page to downstream automation, handle disconnection, and dispose cleanly. This phase does NOT include automation logic (prompt injection, image detection) — only the session infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Chrome Discovery
- Try to connect to an already-running Chrome with debug port first; launch a new Chrome instance as fallback only if no running Chrome is found
- Default debug port: 9222 (standard), with fallback to a random available port if 9222 is occupied
- Auto-detect Chrome installation path via Windows registry and common install locations, with a manual override option in settings
- If Chrome is running WITHOUT the debug port: show a message asking user to close Chrome, then the app will relaunch it with the debug flag. Do NOT auto-kill Chrome.

### Connection Behavior
- Reuse an existing Genspark tab if one is already open in Chrome
- If no Genspark tab is found, auto-navigate a new tab to genspark.ai/agents/image-generator
- Minimize Chrome window after connecting (user can restore if needed)
- When automation finishes: leave Chrome open, disconnect cleanly. Do not close any tabs or the browser.

### Failure & Recovery
- On WebSocket disconnect: notify user with "Connection lost, reconnecting..." message, then retry
- Retry timing: exponential backoff — 3s, 6s, 12s (3 attempts total)
- If all 3 retries fail: show error message with a "Try Again" button. User decides when to retry. Do not auto-relaunch.
- Login detection: after connecting, check if user is logged into Google on Genspark. If not, show a warning "Please log into Google on Genspark first" and pause automation. Do not block — warn and pause.

### Profile Selection
- Show a dropdown list of available Chrome profiles for user to select
- Display format: "email@example.com (Profile Name)" — both email and profile name visible
- Remember the last selected profile and auto-select it on next launch
- When connecting to an already-running Chrome: verify that the connected profile matches the expected/saved profile. Warn if different.

### Claude's Discretion
- Exact implementation of Chrome path auto-detection (registry keys, fallback paths)
- WebSocket endpoint discovery mechanism (HTTP /json/version polling)
- How to read Chrome profile metadata (Local State file parsing)
- Internal state machine for session lifecycle transitions

</decisions>

<specifics>
## Specific Ideas

- Port strategy: try 9222 first (padrao), fall back to random if occupied
- The user's primary account is andrewebemp@gmail.com — this should be the auto-suggested profile when detected
- Chrome should be minimized during automation to avoid visual distraction, but user can restore the window anytime

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-cdp-session-management*
*Context gathered: 2026-02-16*
