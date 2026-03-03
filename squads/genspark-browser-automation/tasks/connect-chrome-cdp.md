---
task: Connect Chrome via CDP
responsavel: "@browser-engineer"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: google_email
    tipo: string
    origem: Config (andrewebemp@gmail.com)
    obrigatorio: true
    validacao: "Email valido da conta Google"
  - campo: fallback_profile_path
    tipo: string
    origem: User Config
    obrigatorio: false
    validacao: "Caminho valido para perfil Chrome"

Saida:
  - campo: browser_connection
    tipo: object
    destino: ChromeSessionManager
    persistido: true
  - campo: login_status
    tipo: boolean
    destino: UI feedback
    persistido: false
  - campo: profile_name
    tipo: string
    destino: UI display
    persistido: false

Checklist:
  - "[ ] Detectar Chrome rodando com --remote-debugging-port"
  - "[ ] Se encontrado, conectar via Puppeteer.connect()"
  - "[ ] Se nao encontrado, localizar perfil Chrome com email Google"
  - "[ ] Lancar Chrome com perfil do usuario (preserva cookies)"
  - "[ ] Verificar se esta logado no Genspark"
  - "[ ] Retornar status de conexao e login"
---

# Connect Chrome via CDP

## Purpose

Conectar ao Chrome existente via Chrome DevTools Protocol (CDP) para manter a sessao Google logada, ou lancar Chrome com o perfil do usuario que contem os cookies da conta Google.

## Pre-Conditions

```yaml
pre-conditions:
  - [ ] Chrome instalado no sistema
    tipo: pre-condition
    blocker: true
    validacao: |
      Verificar existencia do Chrome em caminhos padrao Windows
    error_message: "Chrome nao encontrado. Instale o Google Chrome."
  - [ ] Conta Google logada em algum perfil Chrome
    tipo: pre-condition
    blocker: false
    validacao: |
      Listar perfis Chrome e verificar se algum tem email andrewebemp@gmail.com
    error_message: "Nenhum perfil Chrome encontrado com a conta Google. Faca login no Chrome primeiro."
```

## Execution Steps

### Step 1: Detect Running Chrome

```javascript
const net = require('net');

async function detectChromeDebugPort(ports = [9222, 9223, 9224]) {
  for (const port of ports) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = await response.json();
      return { port, wsEndpoint: data.webSocketDebuggerUrl };
    } catch (e) {
      continue;
    }
  }
  return null;
}
```

### Step 2: Connect or Launch

```javascript
async function connectOrLaunch(email) {
  // Priority 1: Connect to running Chrome
  const running = await detectChromeDebugPort();
  if (running) {
    const browser = await puppeteer.connect({
      browserWSEndpoint: running.wsEndpoint
    });
    return { browser, method: 'cdp-connect' };
  }

  // Priority 2: Launch with user's Chrome profile
  const profiles = listChromeProfiles();
  const googleProfile = profiles.find(p => p.email === email);

  if (googleProfile) {
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: findChromeExe(),
      args: [
        `--user-data-dir=${googleProfile.path}`,
        `--profile-directory=${googleProfile.profileDir}`,
        '--remote-debugging-port=9222',
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    return { browser, method: 'profile-launch' };
  }

  // Priority 3: Launch with app profile (manual login needed)
  const appProfile = ensureAppProfile();
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: findChromeExe(),
    args: [
      `--user-data-dir=${appProfile}`,
      '--remote-debugging-port=9222',
      '--disable-blink-features=AutomationControlled'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });
  return { browser, method: 'app-profile', loginRequired: true };
}
```

### Step 3: Verify Genspark Login

```javascript
async function verifyGensparkLogin(page) {
  await page.goto('https://genspark.ai/agents/image-generator', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Check for login button absence = logged in
  const loginButton = await page.$('button:has-text("Sign in"), a[href*="login"]');
  return !loginButton;
}
```

## Error Handling

### Error 1: Chrome Profile In Use

```yaml
error: PROFILE_IN_USE
cause: Another Chrome instance using the same profile
resolution: Close existing Chrome or use CDP connect to attach
recovery: Try CDP connect first, then suggest closing Chrome
```

### Error 2: No Google Profile Found

```yaml
error: NO_GOOGLE_PROFILE
cause: No Chrome profile with target email found
resolution: Launch with app profile and prompt manual login
recovery: Save cookies after manual login for next time
```

## Post-Conditions

```yaml
post-conditions:
  - [ ] Browser instance connected and responsive
    tipo: post-condition
    blocker: true
    validacao: |
      browser.isConnected() === true
    error_message: "Browser connection lost"
  - [ ] Genspark page loaded and authenticated
    tipo: post-condition
    blocker: true
    validacao: |
      Page URL contains genspark.ai and no login button visible
    error_message: "Not authenticated on Genspark"
```

## Metadata

```yaml
version: 1.0.0
created: 2026-02-16
updated: 2026-02-16
author: squad-creator
tags:
  - genspark-browser-automation
  - chrome-cdp
  - authentication
```

---

*Task definition created by squad-creator*
