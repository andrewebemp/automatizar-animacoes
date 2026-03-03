# Coding Standards - genspark-browser-automation

Extends project conventions from `.planning/codebase/CONVENTIONS.md`.

## Electron Main Process (JS)
- CommonJS modules (require/module.exports)
- JSDoc comments for public functions
- Async/await for all browser operations
- Error handling: try/catch with specific error codes (PROFILE_IN_USE, CHROME_NOT_FOUND, etc.)

## React Components (TSX)
- Functional components with hooks
- Inline styles (project convention)
- Portuguese for user-facing strings
- English for code identifiers and logs

## IPC Channels
- Namespace: `genspark:` prefix for all channels
- Pattern: `genspark:{action}` for invoke, `genspark:{event}` for send

## Browser Automation
- Never hardcode CSS selectors
- Always use discovery-based approach with fallback chain
- Network intercept preferred over DOM polling
- Respect rate limits with exponential backoff
