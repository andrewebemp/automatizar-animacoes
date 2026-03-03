# Browser Automation Quality Checklist

> Quality gates for genspark-browser-automation squad
> Created: 2026-02-16

## Connection Quality

- [ ] CDP connection succeeds to running Chrome (when available)
- [ ] Profile-based launch preserves Google cookies
- [ ] Login status detected correctly on Genspark
- [ ] Reconnection works after Chrome disconnect
- [ ] App profile fallback works when no Google profile found

## Selector Resilience

- [ ] No hardcoded CSS selectors for Genspark UI elements
- [ ] Discovery engine finds textarea with at least 2 strategies
- [ ] Discovery engine finds submit button with at least 2 strategies
- [ ] Selector cache saves and loads correctly
- [ ] Selector cache invalidates after 24 hours

## Image Detection

- [ ] Network intercept captures generated images (>50KB)
- [ ] Filters out avatars, icons, logos, favicons
- [ ] Falls back to DOM polling when network intercept fails
- [ ] Image download works for blob:, data:, and https: URLs
- [ ] Downloaded image buffer is valid PNG/JPEG

## Model Selection

- [ ] Nano Banana Pro detected in model selector (when visible)
- [ ] Already-selected model detected without reopening selector
- [ ] Graceful fallback when model selector not found
- [ ] Model info (name, free status) reported to UI

## Rate Limiting

- [ ] Respects min delay between requests (3s)
- [ ] Exponential backoff on retry
- [ ] Cooldown activated when rate limit detected on page
- [ ] Max 10 requests per minute enforced
- [ ] Rate limit status displayed in UI

## UX Quality

- [ ] Google profile auto-detected and pre-selected
- [ ] Nano Banana Pro badge displayed with "Gratuito" label
- [ ] Progress streaming works in real-time (no lag)
- [ ] Auto-import triggered after generation completes
- [ ] Error messages are user-friendly (Portuguese)

## Error Recovery

- [ ] Chrome crash → auto-reconnect attempted (max 3 times)
- [ ] Network error → retry with backoff
- [ ] Genspark UI change → selector re-discovery
- [ ] Generation state persisted for resume after crash
- [ ] Cancel operation stops cleanly without orphan processes

## Security

- [ ] No API keys stored or transmitted (browser-based auth)
- [ ] Chrome profile path not logged to console in production
- [ ] No credentials in IPC messages
- [ ] User-agent spoofing only for anti-detection (not malicious)

---

*Checklist created by squad-creator*
