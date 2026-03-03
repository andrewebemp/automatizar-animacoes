# Tech Stack - genspark-browser-automation

## Runtime
- Node.js (Electron main process)
- Chrome DevTools Protocol (CDP)

## Libraries
- Puppeteer 24.37.1 (browser automation)
- Puppeteer-core 24.37.1 (CDP connection)
- Electron 28.3.3 (desktop app, IPC)

## Frontend
- React 19.2.3 (GensparkStep.tsx component)
- TypeScript 5.9.3

## Target Service
- Genspark (genspark.ai/agents/image-generator)
- Model: Nano Banana Pro (gratuito via conta Google)
- Auth: Google OAuth via Chrome browser cookies

## Key Patterns
- CDP connection (Puppeteer.connect vs Puppeteer.launch)
- Network interception for image detection
- Electron IPC streaming for real-time progress
- Chrome profile management for session persistence
