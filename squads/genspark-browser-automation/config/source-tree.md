# Source Tree - genspark-browser-automation

## Files to Modify

```
electron/
├── gensparkPlaywright.js      # REFACTOR: Extract session logic, update selectors
├── chromeSessionManager.js    # CREATE: CDP session lifecycle management
└── main.js                    # MODIFY: Register new IPC handlers

src/components/wizard-new/
└── GensparkStep.tsx            # MODIFY: Auto-detect profile, model badge, simplify UX
```

## Squad Structure

```
squads/genspark-browser-automation/
├── squad.yaml                  # Manifest
├── README.md                   # Documentation
├── config/
│   ├── coding-standards.md
│   ├── tech-stack.md
│   └── source-tree.md
├── agents/
│   ├── browser-engineer.md     # Chrome/CDP automation specialist
│   ├── ux-integrator.md        # React frontend specialist
│   └── ipc-architect.md        # Electron IPC specialist
├── tasks/
│   ├── connect-chrome-cdp.md
│   ├── resilient-selectors.md
│   ├── network-intercept-images.md
│   ├── select-nano-banana-pro.md
│   ├── auto-detect-google-profile.md
│   ├── improve-genspark-step-ui.md
│   ├── chrome-session-manager.md
│   └── ipc-streaming-progress.md
├── workflows/
│   └── generate-images.yaml
└── checklists/
    └── browser-automation-quality.md
```
