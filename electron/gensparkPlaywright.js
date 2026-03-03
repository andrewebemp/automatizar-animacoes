/**
 * MÃ³dulo de automaÃ§Ã£o do Genspark usando Puppeteer
 * Gera imagens automaticamente controlando o navegador Chrome
 *
 * Melhorias implementadas:
 * - Seletores robustos com mÃºltiplos fallbacks
 * - Retry com backoff exponencial
 * - DetecÃ§Ã£o de rate limiting
 * - PersistÃªncia de estado para recuperaÃ§Ã£o
 * - ParalelizaÃ§Ã£o opcional (configurÃ¡vel)
 * - Melhor suporte para perfis do Chrome com Puppeteer
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// =============================================================================
// CONFIGURAÃ‡ÃƒO E ESTADO
// =============================================================================

// Estado da automaÃ§Ã£o
let activeBrowser = null;
let activePage = null;
let shouldCancel = false;
let generationState = null; // Estado persistente para recuperaÃ§Ã£o

// ConfiguraÃ§Ãµes de retry
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
};

// ConfiguraÃ§Ãµes de rate limiting
const RATE_LIMIT_CONFIG = {
  minDelayBetweenRequests: 3000,
  maxRequestsPerMinute: 10,
  cooldownOnDetection: 60000 // 1 minuto de cooldown
};

// =============================================================================
// SELETORES ROBUSTOS COM FALLBACKS
// =============================================================================

/**
 * Seletores com mÃºltiplos fallbacks para cada elemento
 * Organizados por prioridade (mais especÃ­fico primeiro)
 */
const SELECTORS = {
  // Campo de texto para prompt
  textarea: [
    'textarea[data-testid="prompt-input"]',
    'textarea[name="prompt"]',
    'textarea[placeholder*="descreva"]',
    'textarea[placeholder*="describe"]',
    'textarea[placeholder*="imagin"]',
    'textarea[placeholder*="Describe"]',
    'textarea[placeholder*="Enter"]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea'
  ],

  // BotÃ£o de submit/enviar
  submitButton: [
    'button[data-testid="submit-button"]',
    'button[type="submit"]',
    'button[aria-label*="send"]',
    'button[aria-label*="enviar"]',
    'button[aria-label*="generate"]',
    'button[aria-label*="gerar"]',
    'form button:has(svg[class*="arrow"])',
    'button:has(svg):near(textarea)',
    '[role="button"]:has(svg):near(textarea)'
  ],

  // BotÃµes de login
  loginButton: [
    'button[data-testid="login-button"]',
    'button:has-text("Sign in")',
    'button:has-text("Login")',
    'button:has-text("Entrar")',
    'button:has-text("Log in")',
    'a:has-text("Sign in")',
    'a:has-text("Login")',
    '[href*="login"]',
    '[href*="signin"]'
  ],

  // Menu de configuraÃ§Ãµes
  configButton: [
    'button[data-testid="settings-button"]',
    'button[aria-label*="config"]',
    'button[aria-label*="settings"]',
    'button:has-text("Config")',
    'button:has-text("Settings")',
    '[class*="settings"]:is(button)',
    'button:has(svg[class*="gear"])',
    'button:has(svg[class*="cog"])'
  ],

  // OpÃ§Ãµes de aspect ratio
  aspectRatioOption: (ratio) => [
    `button[data-value="${ratio}"]`,
    `[role="option"]:has-text("${ratio}")`,
    `button:has-text("${ratio}")`,
    `div:has-text("${ratio}"):is([role="button"])`,
    `text="${ratio}"`
  ],

  // BotÃ£o de auto-prompt
  autoPromptToggle: [
    'button[data-testid="auto-prompt-toggle"]',
    '[role="switch"][aria-label*="prompt"]',
    'button:has-text("Auto")',
    'button:has-text("Prompt"):has(svg)',
    '[class*="prompt"]:has(svg):is(button)',
    '[class*="toggle"]:has-text("prompt")'
  ],

  // Imagem gerada
  generatedImage: [
    'img[data-testid="generated-image"]',
    'img[class*="generated"]',
    'img[class*="result"]',
    'img[alt*="generated"]',
    '[class*="image-container"] img',
    '[class*="result"] img'
  ],

  // Indicadores de loading/processamento
  loadingIndicator: [
    '[data-testid="loading"]',
    '[class*="loading"]',
    '[class*="spinner"]',
    '[class*="progress"]',
    '[role="progressbar"]',
    'svg[class*="animate-spin"]'
  ],

  // Mensagens de erro
  errorMessage: [
    '[data-testid="error-message"]',
    '[role="alert"]',
    '[class*="error"]',
    '[class*="warning"]',
    'text=/rate.?limit/i',
    'text=/too.?many/i',
    'text=/try.?again/i'
  ]
};

/**
 * Encontra um elemento usando mÃºltiplos seletores com fallback (Puppeteer)
 * @param {Page} page - PÃ¡gina do Puppeteer
 * @param {string[]} selectors - Lista de seletores para tentar
 * @param {object} options - OpÃ§Ãµes (timeout, required)
 * @returns {Promise<ElementHandle|null>}
 */
async function findElement(page, selectors, options = {}) {
  const { timeout = 5000, required = false, description = 'elemento' } = options;

  // Filtra seletores incompatÃ­veis com Puppeteer (como :has-text)
  const validSelectors = selectors.filter(s =>
    !s.includes(':has-text') && !s.includes(':near') && !s.includes('text=')
  );

  for (const selector of validSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        // Verifica se estÃ¡ visÃ­vel
        const isVisible = await page.evaluate(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }, element);

        if (isVisible) {
          console.log(`[Seletor] Encontrado ${description}: ${selector}`);
          return element;
        }
      }
    } catch (e) {
      // Seletor invÃ¡lido ou erro, tenta prÃ³ximo
    }
  }

  // Se nÃ£o encontrou, tenta waitForSelector com timeout curto
  for (const selector of validSelectors.slice(0, 3)) { // SÃ³ os 3 primeiros
    try {
      const element = await page.waitForSelector(selector, {
        timeout: Math.min(timeout, 2000),
        visible: true
      });
      if (element) {
        console.log(`[Seletor] Encontrado (wait) ${description}: ${selector}`);
        return element;
      }
    } catch (e) {
      // Timeout ou erro, tenta prÃ³ximo
    }
  }

  if (required) {
    throw new Error(`${description} nÃ£o encontrado apÃ³s tentar ${validSelectors.length} seletores`);
  }

  console.warn(`[Seletor] ${description} nÃ£o encontrado`);
  return null;
}

/**
 * Aguarda um elemento aparecer com mÃºltiplos seletores (Puppeteer)
 */
async function waitForElement(page, selectors, options = {}) {
  const { timeout = 30000, description = 'elemento' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = await findElement(page, selectors, {
      timeout: 1000,
      description
    });
    if (element) return element;
    await delay(500);
  }

  return null;
}

/**
 * FunÃ§Ã£o de delay (substitui page.waitForTimeout do Playwright)
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// RETRY COM BACKOFF EXPONENCIAL
// =============================================================================

/**
 * Executa uma operaÃ§Ã£o com retry e backoff exponencial
 * @param {function} operation - FunÃ§Ã£o async a executar
 * @param {object} options - ConfiguraÃ§Ãµes de retry
 * @returns {Promise<any>}
 */
async function withRetry(operation, options = {}) {
  const {
    maxRetries = RETRY_CONFIG.maxRetries,
    baseDelay = RETRY_CONFIG.baseDelayMs,
    maxDelay = RETRY_CONFIG.maxDelayMs,
    backoffMultiplier = RETRY_CONFIG.backoffMultiplier,
    operationName = 'operaÃ§Ã£o',
    shouldRetry = () => true,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Calcula delay com backoff exponencial + jitter
      const exponentialDelay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);
      const jitter = Math.random() * 1000;
      const delay = Math.min(exponentialDelay + jitter, maxDelay);

      console.log(`[Retry] ${operationName} falhou (tentativa ${attempt}/${maxRetries + 1}): ${error.message}`);
      console.log(`[Retry] Aguardando ${Math.round(delay)}ms antes de tentar novamente...`);

      onRetry?.(attempt, delay, error);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// =============================================================================
// DETECÃ‡ÃƒO DE RATE LIMITING
// =============================================================================

let requestTimestamps = [];
let isInCooldown = false;
let cooldownEndTime = 0;

/**
 * Verifica se estamos em rate limit
 */
function checkRateLimit() {
  const now = Date.now();

  // Remove timestamps antigos (mais de 1 minuto)
  requestTimestamps = requestTimestamps.filter(ts => now - ts < 60000);

  // Verifica cooldown ativo
  if (isInCooldown && now < cooldownEndTime) {
    const remainingCooldown = Math.ceil((cooldownEndTime - now) / 1000);
    return {
      limited: true,
      reason: 'cooldown',
      waitTime: cooldownEndTime - now,
      message: `Em cooldown. Aguarde ${remainingCooldown}s`
    };
  } else if (isInCooldown && now >= cooldownEndTime) {
    isInCooldown = false;
    cooldownEndTime = 0;
  }

  // Verifica limite de requisiÃ§Ãµes por minuto
  if (requestTimestamps.length >= RATE_LIMIT_CONFIG.maxRequestsPerMinute) {
    const oldestRequest = Math.min(...requestTimestamps);
    const waitTime = 60000 - (now - oldestRequest);
    return {
      limited: true,
      reason: 'requests_per_minute',
      waitTime,
      message: `Limite de requisiÃ§Ãµes. Aguarde ${Math.ceil(waitTime / 1000)}s`
    };
  }

  return { limited: false };
}

/**
 * Registra uma requisiÃ§Ã£o
 */
function recordRequest() {
  requestTimestamps.push(Date.now());
}

/**
 * Ativa cooldown por rate limiting detectado
 */
function activateCooldown(duration = RATE_LIMIT_CONFIG.cooldownOnDetection) {
  isInCooldown = true;
  cooldownEndTime = Date.now() + duration;
  console.log(`[RateLimit] Cooldown ativado por ${duration / 1000}s`);
}

/**
 * Detecta mensagens de rate limiting na pÃ¡gina
 */
async function detectRateLimitOnPage(page) {
  try {
    const errorSelectors = SELECTORS.errorMessage;

    for (const selector of errorSelectors) {
      const element = await page.$(selector);
      if (element) {
        const text = await element.textContent().catch(() => '');
        const lowerText = text.toLowerCase();

        if (lowerText.includes('rate') ||
            lowerText.includes('limit') ||
            lowerText.includes('too many') ||
            lowerText.includes('aguarde') ||
            lowerText.includes('wait')) {
          return { detected: true, message: text };
        }
      }
    }

    return { detected: false };
  } catch (e) {
    return { detected: false };
  }
}

// =============================================================================
// PERSISTÃŠNCIA DE ESTADO
// =============================================================================

/**
 * Caminho do arquivo de estado
 */
function getStatePath() {
  const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appDataPath, 'AutomatizarAnimacoes', 'genspark-state.json');
}

/**
 * Salva estado atual da geraÃ§Ã£o
 */
function saveGenerationState(state) {
  try {
    const statePath = getStatePath();
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    generationState = state;
    console.log('[Estado] Salvo:', state.completedCount, '/', state.totalCount);
  } catch (e) {
    console.warn('[Estado] Erro ao salvar:', e.message);
  }
}

/**
 * Carrega estado salvo
 */
function loadGenerationState() {
  try {
    const statePath = getStatePath();
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(data);

      // Verifica se o estado ainda Ã© vÃ¡lido (menos de 1 hora)
      if (Date.now() - state.timestamp < 3600000) {
        console.log('[Estado] Carregado:', state.completedCount, '/', state.totalCount);
        return state;
      } else {
        console.log('[Estado] Expirado, ignorando');
        clearGenerationState();
      }
    }
  } catch (e) {
    console.warn('[Estado] Erro ao carregar:', e.message);
  }
  return null;
}

/**
 * Limpa estado salvo
 */
function clearGenerationState() {
  try {
    const statePath = getStatePath();
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    generationState = null;
  } catch (e) {
    // Ignora erros
  }
}

/**
 * Retorna estado atual da geraÃ§Ã£o
 */
function getGenerationState() {
  return generationState || loadGenerationState();
}

// =============================================================================
// FUNÃ‡Ã•ES PRINCIPAIS
// =============================================================================

// Caminho do perfil Chrome dedicado para o app
function getDefaultProfilePath() {
  const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appDataPath, 'AutomatizarAnimacoes', 'ChromeProfile');
}

/**
 * Limpa locks antigos do perfil que podem ter ficado após crash
 * Isso permite usar o perfil do app mesmo se um processo anterior travou
 */
function cleanupStaleLocks(profilePath) {
  const lockFiles = ['lockfile', 'SingletonLock', 'SingletonSocket', 'SingletonCookie'];

  for (const lockFile of lockFiles) {
    const lockPath = path.join(profilePath, lockFile);
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        console.log(`[GensparkPuppeteer] Lock removido: ${lockFile}`);
      }
    } catch (e) {
      // Se não conseguiu remover, o arquivo está em uso por outro processo
      console.log(`[GensparkPuppeteer] Não foi possível remover ${lockFile}: ${e.message}`);
    }
  }
}

// Lista perfis Chrome disponÃ­veis no sistema
function listChromeProfiles() {
  const profiles = [];

  // Perfil dedicado do app
  const appProfilePath = getDefaultProfilePath();
  profiles.push({
    name: 'Perfil do App (Recomendado)',
    path: appProfilePath,
    isAppProfile: true,
    exists: fs.existsSync(appProfilePath),
    profileDir: null,
    email: null
  });

  // Perfis do Chrome do usuÃ¡rio (Windows)
  const chromeUserData = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');

  if (fs.existsSync(chromeUserData)) {
    // LÃª Local State para obter informaÃ§Ãµes dos perfis (incluindo email)
    const localStatePath = path.join(chromeUserData, 'Local State');
    let profilesInfo = {};

    if (fs.existsSync(localStatePath)) {
      try {
        const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
        profilesInfo = localState.profile?.info_cache || {};
      } catch (e) {
        console.warn('[listChromeProfiles] Erro ao ler Local State:', e.message);
      }
    }

    const entries = fs.readdirSync(chromeUserData);
    for (const entry of entries) {
      if (entry.startsWith('Profile ') || entry === 'Default') {
        const profilePath = path.join(chromeUserData, entry);
        const prefsFile = path.join(profilePath, 'Preferences');

        if (fs.existsSync(prefsFile)) {
          try {
            const prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
            const profileName = prefs.profile?.name || entry;

            // ObtÃ©m email do Local State
            const infoCache = profilesInfo[entry] || {};
            const email = infoCache.user_name || null;
            const gaiaName = infoCache.gaia_name || null;

            // Nome de exibiÃ§Ã£o: "Nome (email)" se tiver email
            const displayName = email
              ? `Chrome: ${profileName} (${email})`
              : `Chrome: ${profileName}`;

            profiles.push({
              name: displayName,
              path: chromeUserData, // User Data path (nÃ£o o perfil especÃ­fico!)
              profileDir: entry, // Nome da pasta do perfil (Default, Profile 1, etc)
              isAppProfile: false,
              exists: true,
              email: email,
              gaiaName: gaiaName,
              warning: 'Feche o Chrome antes de usar este perfil'
            });
          } catch (e) {
            // Ignora perfis com erro
          }
        }
      }
    }
  }

  return profiles;
}

// Cria o perfil do app se nÃ£o existir
function ensureAppProfile() {
  const profilePath = getDefaultProfilePath();
  if (!fs.existsSync(profilePath)) {
    fs.mkdirSync(profilePath, { recursive: true });
    console.log('[GensparkPlaywright] Perfil do app criado:', profilePath);
  }
  return profilePath;
}

/**
 * Gera imagens no Genspark
 * @param {object} config - ConfiguraÃ§Ã£o da geraÃ§Ã£o
 * @param {string[]} config.prompts - Lista de prompts para gerar
 * @param {string} config.aspectRatio - ProporÃ§Ã£o: '16:9', '1:1', '9:16'
 * @param {string} config.profilePath - Caminho do perfil Chrome (ou 'auto')
 * @param {string} config.profileDir - Nome da pasta do perfil (Default, Profile 1, etc)
 * @param {string} config.outputFolder - Pasta para salvar imagens
 * @param {number} config.delayBetweenPrompts - Delay em ms entre prompts (padrÃ£o: 5000)
 * @param {boolean} config.resumeFromState - Tentar continuar de estado salvo
 * @param {number} config.parallelCount - NÃºmero de geraÃ§Ãµes paralelas (1 = sequencial)
 * @param {function} config.onProgress - Callback de progresso
 * @param {function} config.onImageGenerated - Callback quando imagem Ã© gerada
 * @param {function} config.onError - Callback de erro
 * @param {function} config.onRateLimited - Callback quando rate limited
 * @returns {Promise<string[]>} - Lista de caminhos das imagens geradas
 */
async function generateImages(config) {
  const {
    prompts,
    aspectRatio = '16:9',
    profilePath = 'auto',
    profileDir = null, // Nome da pasta do perfil Chrome (Default, Profile 1, etc)
    outputFolder,
    delayBetweenPrompts = 5000,
    resumeFromState = true,
    parallelCount = 1,
    onProgress,
    onImageGenerated,
    onError,
    onRateLimited
  } = config;

  shouldCancel = false;
  const generatedImages = [];
  let startIndex = 0;

  // Verifica estado salvo para continuar
  if (resumeFromState) {
    const savedState = loadGenerationState();
    if (savedState && savedState.outputFolder === outputFolder &&
        savedState.totalCount === prompts.length) {
      startIndex = savedState.completedCount;
      savedState.generatedImages?.forEach(img => generatedImages.push(img));
      console.log(`[GensparkPlaywright] Continuando do prompt ${startIndex + 1}`);
      onProgress?.({
        status: 'resuming',
        message: `Continuando do prompt ${startIndex + 1}/${prompts.length}`,
        current: startIndex,
        total: prompts.length
      });
    }
  }

  // Resolve o caminho do perfil
  const resolvedProfilePath = profilePath === 'auto' ? ensureAppProfile() : profilePath;
  const isUsingAppProfile = profilePath === 'auto';

  console.log('[GensparkPlaywright] Iniciando automação');
  console.log('[GensparkPlaywright] Perfil:', resolvedProfilePath);
  console.log('[GensparkPlaywright] Usando perfil do app:', isUsingAppProfile);

  // Se estiver usando o perfil do app, limpa locks antigos (pode ter ficado de crash anterior)
  if (isUsingAppProfile) {
    console.log('[GensparkPlaywright] Limpando locks antigos do perfil do app...');
    cleanupStaleLocks(resolvedProfilePath);
  }
  console.log('[GensparkPlaywright] Prompts:', prompts.length, '(comeÃ§ando do', startIndex + 1, ')');
  console.log('[GensparkPlaywright] Aspect Ratio:', aspectRatio);
  console.log('[GensparkPlaywright] Output:', outputFolder);
  console.log('[GensparkPlaywright] Paralelo:', parallelCount);

  // Cria pasta de output se nÃ£o existir
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  try {
    // LanÃ§a o navegador com Puppeteer
    onProgress?.({ status: 'launching', message: 'Abrindo navegador...' });

    // Encontra o executÃ¡vel do Chrome
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ];

    let chromeExe = null;
    for (const p of chromePaths) {
      if (fs.existsSync(p)) {
        chromeExe = p;
        break;
      }
    }

    if (!chromeExe) {
      throw new Error('Chrome nÃ£o encontrado. Instale o Google Chrome.');
    }

    console.log('[GensparkPuppeteer] Chrome executÃ¡vel:', chromeExe);

    // Monta argumentos do Chrome para Puppeteer
    const chromeArgs = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--disable-extensions',
      '--start-maximized',
      `--user-data-dir=${resolvedProfilePath}`
    ];

    // Se tiver profileDir, adiciona --profile-directory
    if (profileDir) {
      chromeArgs.push(`--profile-directory=${profileDir}`);
      console.log(`[GensparkPuppeteer] Usando perfil Chrome: ${profileDir}`);
    }

    console.log('[GensparkPuppeteer] Args:', chromeArgs.join(' '));

    try {
      activeBrowser = await puppeteer.launch({
        headless: false,
        executablePath: chromeExe,
        args: chromeArgs,
        defaultViewport: { width: 1280, height: 800 },
        ignoreDefaultArgs: ['--enable-automation']
      });
    } catch (launchError) {
      console.error('[GensparkPuppeteer] Erro ao abrir navegador:', launchError.message);
      console.error('[GensparkPuppeteer] Stack:', launchError.stack);

      // Verifica se é erro de perfil em uso
      if (launchError.message.includes('user data directory is already in use') ||
          launchError.message.includes('Target page, context or browser has been closed') ||
          launchError.message.includes('browser has been closed')) {

        if (isUsingAppProfile) {
          // Perfil do app em uso - provavelmente outra instância do app
          throw new Error('PERFIL_EM_USO: O perfil do app já está em uso. Isso pode acontecer se:\n' +
            '1. Outra instância do app está rodando\n' +
            '2. O app travou anteriormente e deixou o Chrome aberto\n\n' +
            'Solução: Abra o Gerenciador de Tarefas (Ctrl+Shift+Esc), procure por "Chrome" e finalize os processos do Chrome que mostram "AutomatizarAnimacoes" no caminho.');
        } else {
          // Perfil do usuário em uso
          throw new Error('PERFIL_EM_USO: O Chrome está aberto com este perfil. Você tem duas opções:\n' +
            '1. Feche TODAS as janelas do Chrome e tente novamente\n' +
            '2. (Recomendado) Selecione "Perfil do App" no dropdown - ele funciona com seu Chrome aberto!');
        }
      }

      if (launchError.message.includes('Failed to launch') ||
          launchError.message.includes('ENOENT') ||
          launchError.message.includes('spawn')) {
        throw new Error(`CHROME_NAO_ENCONTRADO: Não foi possível iniciar o Chrome. Verifique se o Chrome está instalado em: ${chromeExe}`);
      }

      if (launchError.message.includes('timeout')) {
        throw new Error('TIMEOUT: O Chrome demorou muito para iniciar. Tente fechar outros programas e tentar novamente.');
      }

      throw new Error(`Erro ao abrir navegador: ${launchError.message}`);
    }

    // ObtÃ©m as pÃ¡ginas existentes
    const existingPages = await activeBrowser.pages();
    console.log('[GensparkPuppeteer] PÃ¡ginas existentes:', existingPages.length);

    // Usa a primeira pÃ¡gina existente ou cria uma nova
    if (existingPages.length > 0) {
      activePage = existingPages[0];
      console.log('[GensparkPuppeteer] Usando pÃ¡gina existente, URL:', activePage.url());
    } else {
      activePage = await activeBrowser.newPage();
      console.log('[GensparkPuppeteer] Nova pÃ¡gina criada');
    }

    // Configura a pÃ¡gina para parecer mais humana
    await activePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navega para o Genspark
    const targetUrl = 'https://genspark.ai/agents/image-generator';
    onProgress?.({ status: 'navigating', message: 'Navegando para Genspark...' });
    console.log('[GensparkPuppeteer] Navegando para:', targetUrl);

    // Navega com Puppeteer
    try {
      console.log('[GensparkPuppeteer] Executando goto()...');
      await activePage.goto(targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      console.log('[GensparkPuppeteer] NavegaÃ§Ã£o concluÃ­da, URL:', activePage.url());
    } catch (navError) {
      console.error('[GensparkPuppeteer] Erro na navegaÃ§Ã£o:', navError.message);

      // Se falhou, tenta novamente
      try {
        console.log('[GensparkPuppeteer] Tentando novamente com domcontentloaded...');
        await activePage.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        // Aguarda carregar
        await delay(5000);
      } catch (e) {
        console.error('[GensparkPuppeteer] Segunda tentativa falhou:', e.message);
        throw new Error(`NÃ£o foi possÃ­vel navegar para Genspark. Erro: ${navError.message}`);
      }
    }

    console.log('[GensparkPuppeteer] Página carregada, URL final:', activePage.url());
    await delay(3000);

    // Verifica se a navegação foi bem sucedida
    const currentUrl = activePage.url();
    console.log('[GensparkPuppeteer] Verificando URL atual:', currentUrl);

    if (!currentUrl.includes('genspark.ai')) {
      console.error('[GensparkPuppeteer] FALHA: Não estamos no Genspark!');
      console.error('[GensparkPuppeteer] URL atual:', currentUrl);

      // Tenta obter informações da página para diagnóstico
      try {
        const pageTitle = await activePage.title();
        console.error('[GensparkPuppeteer] Título da página:', pageTitle);

        const pageContent = await activePage.content();
        console.error('[GensparkPuppeteer] Conteúdo (primeiros 500 chars):', pageContent.substring(0, 500));
      } catch (diagErr) {
        console.error('[GensparkPuppeteer] Erro ao obter diagnóstico:', diagErr.message);
      }

      // Tenta navegar novamente com força
      console.log('[GensparkPuppeteer] Tentando navegação forçada...');
      onProgress?.({ status: 'navigating', message: 'Tentando novamente...' });

      await activePage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(5000);

      const retryUrl = activePage.url();
      if (!retryUrl.includes('genspark.ai')) {
        throw new Error(`Navegação falhou. URL: ${retryUrl}. Verifique sua conexão e tente novamente.`);
      }
    }

    console.log('[GensparkPuppeteer] Navegação confirmada em genspark.ai');

    // Verifica se está logado
    const isLoggedIn = await checkIfLoggedIn(activePage);

    if (!isLoggedIn) {
      onProgress?.({
        status: 'login_required',
        message: 'FaÃ§a login no Genspark e clique em Continuar no app'
      });

      await waitForLogin(activePage, 300000);
    }

    // Configura o aspect ratio
    onProgress?.({ status: 'configuring', message: 'Configurando proporÃ§Ã£o...' });
    await configureAspectRatio(activePage, aspectRatio);

    // Desabilita prompt automÃ¡tico
    onProgress?.({ status: 'configuring', message: 'Desabilitando prompt automÃ¡tico...' });
    await disableAutoPrompt(activePage);

    // Processa prompts (sequencial ou paralelo)
    if (parallelCount <= 1) {
      // Modo sequencial
      await processPromptsSequential(
        activePage, prompts, startIndex, outputFolder, delayBetweenPrompts,
        generatedImages, onProgress, onImageGenerated, onError, onRateLimited
      );
    } else {
      // Modo paralelo (mÃºltiplas abas)
      await processPromptsParallel(
        activeBrowser, prompts, startIndex, outputFolder, delayBetweenPrompts,
        parallelCount, generatedImages, onProgress, onImageGenerated, onError, onRateLimited
      );
    }

    // Limpa estado se completou com sucesso
    if (generatedImages.length === prompts.length) {
      clearGenerationState();
    }

    onProgress?.({
      status: 'completed',
      current: generatedImages.length,
      total: prompts.length,
      message: `ConcluÃ­do! ${generatedImages.length}/${prompts.length} imagens geradas.`
    });

  } catch (err) {
    console.error('[GensparkPlaywright] Erro fatal:', err.message);
    onError?.({ message: err.message, fatal: true });
    throw err;
  } finally {
    if (activeBrowser) {
      try {
        await activeBrowser.close();
      } catch (e) {
        // Ignora erros ao fechar
      }
      activeBrowser = null;
      activePage = null;
    }
  }

  return generatedImages;
}

/**
 * Processa prompts sequencialmente
 */
async function processPromptsSequential(
  page, prompts, startIndex, outputFolder, delayBetweenPrompts,
  generatedImages, onProgress, onImageGenerated, onError, onRateLimited
) {
  for (let i = startIndex; i < prompts.length; i++) {
    if (shouldCancel) {
      console.log('[GensparkPlaywright] Cancelado pelo usuÃ¡rio');
      break;
    }

    const prompt = prompts[i];
    const imageIndex = i + 1;
    const fileName = `${String(imageIndex).padStart(2, '0')}.png`;
    const filePath = path.join(outputFolder, fileName);

    // Verifica rate limit antes de processar
    const rateLimitStatus = checkRateLimit();
    if (rateLimitStatus.limited) {
      console.log(`[RateLimit] ${rateLimitStatus.message}`);
      onRateLimited?.({
        reason: rateLimitStatus.reason,
        waitTime: rateLimitStatus.waitTime,
        message: rateLimitStatus.message
      });
      onProgress?.({
        status: 'rate_limited',
        current: imageIndex,
        total: prompts.length,
        message: rateLimitStatus.message,
        waitTime: rateLimitStatus.waitTime
      });
      await new Promise(resolve => setTimeout(resolve, rateLimitStatus.waitTime));
    }

    onProgress?.({
      status: 'generating',
      current: imageIndex,
      total: prompts.length,
      message: `Gerando imagem ${imageIndex}/${prompts.length}...`
    });

    try {
      // Usa retry para a geraÃ§Ã£o
      const imageUrl = await withRetry(
        async () => {
          // Verifica rate limit na pÃ¡gina
          const pageRateLimit = await detectRateLimitOnPage(page);
          if (pageRateLimit.detected) {
            activateCooldown();
            throw new Error(`Rate limited: ${pageRateLimit.message}`);
          }

          await injectPrompt(page, prompt);
          await submitPrompt(page);
          recordRequest();

          const url = await waitForImage(page, 120000);
          if (!url) {
            throw new Error('Timeout aguardando imagem');
          }
          return url;
        },
        {
          operationName: `geraÃ§Ã£o de imagem ${imageIndex}`,
          maxRetries: 2,
          shouldRetry: (err) => {
            // NÃ£o retenta se for cancelamento ou rate limit permanente
            if (shouldCancel) return false;
            if (err.message.includes('Rate limited')) {
              onRateLimited?.({ message: err.message });
              return true; // Retenta apÃ³s cooldown
            }
            return true;
          },
          onRetry: (attempt, delay, err) => {
            onProgress?.({
              status: 'retrying',
              current: imageIndex,
              total: prompts.length,
              message: `Tentativa ${attempt + 1}: ${err.message}. Aguardando...`,
              retryDelay: delay
            });
          }
        }
      );

      if (imageUrl) {
        const imageBuffer = await downloadImage(page, imageUrl);

        if (imageBuffer) {
          fs.writeFileSync(filePath, imageBuffer);
          generatedImages.push(filePath);

          const base64 = imageBuffer.toString('base64');
          const dataUrl = `data:image/png;base64,${base64}`;

          onImageGenerated?.({
            index: imageIndex,
            filePath,
            dataUrl,
            prompt: prompt.substring(0, 100)
          });

          // Salva estado
          saveGenerationState({
            timestamp: Date.now(),
            outputFolder,
            totalCount: prompts.length,
            completedCount: generatedImages.length,
            generatedImages: [...generatedImages]
          });

          console.log(`[GensparkPlaywright] Imagem ${imageIndex} salva:`, filePath);
        }
      }

      // Navega de volta para prÃ³ximo prompt
      if (i < prompts.length - 1) {
        await page.goto('https://genspark.ai/agents/image-generator', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await delay(Math.max(delayBetweenPrompts, RATE_LIMIT_CONFIG.minDelayBetweenRequests));
      }

    } catch (err) {
      console.error(`[GensparkPlaywright] Erro no prompt ${imageIndex}:`, err.message);
      onError?.({ index: imageIndex, message: err.message });

      // Tenta recuperar
      try {
        await page.goto('https://genspark.ai/agents/image-generator', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await delay(3000);
      } catch (navErr) {
        console.error('[GensparkPlaywright] Erro na recuperaÃ§Ã£o:', navErr.message);
      }
    }
  }
}

/**
 * Processa prompts em paralelo (mÃºltiplas abas)
 */
async function processPromptsParallel(
  browser, prompts, startIndex, outputFolder, delayBetweenPrompts,
  parallelCount, generatedImages, onProgress, onImageGenerated, onError, onRateLimited
) {
  const pages = [];
  const actualParallel = Math.min(parallelCount, 3); // MÃ¡ximo 3 paralelo para nÃ£o sobrecarregar

  // Cria pÃ¡ginas adicionais
  for (let p = 0; p < actualParallel; p++) {
    const page = p === 0 ? activePage : await browser.newPage();
    pages.push(page);

    if (p > 0) {
      await page.goto('https://genspark.ai/agents/image-generator', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await delay(2000);
    }
  }

  // Processa em lotes paralelos
  const remaining = prompts.slice(startIndex);
  const results = new Map();

  for (let batchStart = 0; batchStart < remaining.length; batchStart += actualParallel) {
    if (shouldCancel) break;

    const batch = remaining.slice(batchStart, batchStart + actualParallel);

    onProgress?.({
      status: 'generating_batch',
      current: startIndex + batchStart + 1,
      total: prompts.length,
      message: `Gerando lote de ${batch.length} imagens (${startIndex + batchStart + 1}-${Math.min(startIndex + batchStart + batch.length, prompts.length)}/${prompts.length})...`
    });

    // Processa batch em paralelo
    const batchPromises = batch.map(async (prompt, batchIndex) => {
      const globalIndex = startIndex + batchStart + batchIndex;
      const imageIndex = globalIndex + 1;
      const fileName = `${String(imageIndex).padStart(2, '0')}.png`;
      const filePath = path.join(outputFolder, fileName);
      const page = pages[batchIndex % pages.length];

      try {
        // Verifica rate limit
        const rateLimitStatus = checkRateLimit();
        if (rateLimitStatus.limited) {
          await new Promise(resolve => setTimeout(resolve, rateLimitStatus.waitTime));
        }

        await injectPrompt(page, prompt);
        await submitPrompt(page);
        recordRequest();

        const imageUrl = await waitForImage(page, 120000);
        if (imageUrl) {
          const imageBuffer = await downloadImage(page, imageUrl);
          if (imageBuffer) {
            fs.writeFileSync(filePath, imageBuffer);

            const base64 = imageBuffer.toString('base64');
            const dataUrl = `data:image/png;base64,${base64}`;

            onImageGenerated?.({
              index: imageIndex,
              filePath,
              dataUrl,
              prompt: prompt.substring(0, 100)
            });

            return { success: true, filePath, index: imageIndex };
          }
        }
        return { success: false, index: imageIndex };
      } catch (err) {
        onError?.({ index: imageIndex, message: err.message });
        return { success: false, index: imageIndex, error: err.message };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result.success) {
        generatedImages.push(result.filePath);
        results.set(result.index, result.filePath);
      }
    }

    // Salva estado apÃ³s cada batch
    saveGenerationState({
      timestamp: Date.now(),
      outputFolder,
      totalCount: prompts.length,
      completedCount: generatedImages.length,
      generatedImages: [...generatedImages]
    });

    // Delay entre batches
    if (batchStart + actualParallel < remaining.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenPrompts));

      // Recarrega pÃ¡ginas para prÃ³ximo batch
      for (const page of pages) {
        try {
          await page.goto('https://genspark.ai/agents/image-generator', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
        } catch (e) {
          // Ignora erros de navegaÃ§Ã£o
        }
      }
      await delay(2000);
    }
  }

  // Fecha pÃ¡ginas extras
  for (let p = 1; p < pages.length; p++) {
    try {
      await pages[p].close();
    } catch (e) {
      // Ignora
    }
  }
}

// =============================================================================
// FUNÃ‡Ã•ES AUXILIARES
// =============================================================================

// Verifica se estÃ¡ logado no Genspark
async function checkIfLoggedIn(page) {
  try {
    const loginButton = await findElement(page, SELECTORS.loginButton, {
      description: 'botÃ£o de login',
      timeout: 2000
    });
    return !loginButton;
  } catch (e) {
    return true;
  }
}

// Aguarda o usuÃ¡rio fazer login
async function waitForLogin(page, timeout) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (shouldCancel) return;

    const isLoggedIn = await checkIfLoggedIn(page);
    if (isLoggedIn) {
      console.log('[GensparkPlaywright] Login detectado');
      return;
    }

    await delay(2000);
  }

  throw new Error('Timeout aguardando login');
}

// Configura o aspect ratio
async function configureAspectRatio(page, ratio) {
  try {
    const configButton = await findElement(page, SELECTORS.configButton, {
      description: 'botÃ£o de configuraÃ§Ãµes'
    });

    if (configButton) {
      await configButton.click();
      await delay(500);

      const ratioSelectors = SELECTORS.aspectRatioOption(ratio);
      const ratioOption = await findElement(page, ratioSelectors, {
        description: `opÃ§Ã£o ${ratio}`
      });

      if (ratioOption) {
        await ratioOption.click();
        await delay(300);
      }

      await page.keyboard.press('Escape');
    }
  } catch (e) {
    console.warn('[GensparkPlaywright] Erro ao configurar aspect ratio:', e.message);
  }
}

// Desabilita prompt automÃ¡tico
async function disableAutoPrompt(page) {
  try {
    const promptButton = await findElement(page, SELECTORS.autoPromptToggle, {
      description: 'toggle de auto-prompt'
    });

    if (promptButton) {
      const isChecked = await promptButton.getAttribute('aria-checked');
      const hasSvg = await promptButton.$('svg');

      if (isChecked === 'true' || hasSvg) {
        await promptButton.click();
        await delay(300);
        console.log('[GensparkPlaywright] Prompt automÃ¡tico desabilitado');
      }
    }
  } catch (e) {
    console.warn('[GensparkPlaywright] Erro ao desabilitar auto-prompt:', e.message);
  }
}

// Injeta prompt no campo de texto (Puppeteer)
async function injectPrompt(page, prompt) {
  const textarea = await findElement(page, SELECTORS.textarea, {
    description: 'campo de texto',
    required: true,
    timeout: 10000
  });

  // Clica no textarea
  await textarea.click();
  await delay(100);

  // Limpa o campo (Puppeteer usa triple-click + backspace ou evaluate)
  await page.evaluate(el => { el.value = ''; }, textarea);
  await delay(100);

  // Digita o prompt
  await textarea.type(prompt, { delay: 10 });
  await delay(200);

  // Verifica se digitou corretamente
  const value = await page.evaluate(el => el.value || el.textContent || '', textarea);
  if (!value || value.length < 10) {
    // Tenta novamente via evaluate
    await page.evaluate((el, text) => {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, textarea, prompt);
  }

  console.log('[GensparkPuppeteer] Prompt injetado:', prompt.substring(0, 50) + '...');
}

// Submete o prompt
async function submitPrompt(page) {
  const submitButton = await findElement(page, SELECTORS.submitButton, {
    description: 'botÃ£o de enviar'
  });

  if (submitButton) {
    await submitButton.click();
    console.log('[GensparkPlaywright] Clicou no botÃ£o de submit');
  } else {
    await page.keyboard.press('Enter');
    console.log('[GensparkPlaywright] Enviou Enter');
  }

  await delay(1000);
}

// Aguarda imagem ser gerada
async function waitForImage(page, timeout) {
  const startTime = Date.now();
  const knownImages = new Set();

  // Coleta imagens existentes
  const existingImages = await page.$$eval('img', imgs =>
    imgs.filter(img => img.naturalWidth >= 200 && img.naturalHeight >= 200)
        .map(img => img.src)
  );
  existingImages.forEach(src => knownImages.add(src));

  console.log('[GensparkPlaywright] Imagens conhecidas:', knownImages.size);

  while (Date.now() - startTime < timeout) {
    if (shouldCancel) return null;

    // Verifica rate limit na pÃ¡gina
    const pageRateLimit = await detectRateLimitOnPage(page);
    if (pageRateLimit.detected) {
      console.warn('[GensparkPlaywright] Rate limit detectado:', pageRateLimit.message);
      activateCooldown();
      throw new Error(`Rate limited: ${pageRateLimit.message}`);
    }

    // Procura novas imagens grandes
    const currentImages = await page.$$eval('img', imgs =>
      imgs.filter(img => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        return w >= 200 && h >= 200;
      }).map(img => ({
        src: img.src,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      }))
    );

    for (const img of currentImages) {
      if (!knownImages.has(img.src)) {
        const src = img.src.toLowerCase();
        if (src.includes('avatar') || src.includes('icon') ||
            src.includes('logo') || src.includes('data:image/svg')) {
          continue;
        }

        console.log('[GensparkPlaywright] Nova imagem detectada:', img.src.substring(0, 80));
        return img.src;
      }
    }

    // Verifica se mudou de pÃ¡gina
    const url = page.url();
    if (url.includes('?id=')) {
      await delay(3000);

      const resultImages = await page.$$eval('img', imgs =>
        imgs.filter(img => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          return w >= 400 && h >= 400;
        }).map(img => img.src)
      );

      if (resultImages.length > 0) {
        console.log('[GensparkPlaywright] Imagem encontrada na pÃ¡gina de resultado');
        return resultImages[0];
      }
    }

    await delay(1000);
  }

  return null;
}

// Baixa uma imagem (Puppeteer)
async function downloadImage(page, imageUrl) {
  try {
    if (imageUrl.startsWith('data:')) {
      const base64 = imageUrl.split(',')[1];
      return Buffer.from(base64, 'base64');
    }

    if (imageUrl.startsWith('blob:')) {
      const base64 = await page.evaluate(async (url) => {
        const img = document.querySelector(`img[src="${url}"]`);
        if (!img) return null;

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
      }, imageUrl);

      if (base64) {
        return Buffer.from(base64, 'base64');
      }
    }

    // Usa fetch via page.evaluate para baixar a imagem
    const base64 = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result;
            resolve(dataUrl.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        return null;
      }
    }, imageUrl);

    if (base64) {
      return Buffer.from(base64, 'base64');
    }

    return null;

  } catch (err) {
    console.error('[GensparkPuppeteer] Erro ao baixar imagem:', err.message);
    return null;
  }
}

// Cancela a automaÃ§Ã£o em andamento
function cancelGeneration() {
  console.log('[GensparkPlaywright] Cancelamento solicitado');
  shouldCancel = true;
}

// Verifica se hÃ¡ uma automaÃ§Ã£o em andamento
function isRunning() {
  return activeBrowser !== null;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  generateImages,
  cancelGeneration,
  isRunning,
  listChromeProfiles,
  getDefaultProfilePath,
  ensureAppProfile,
  // Novas funcionalidades
  getGenerationState,
  clearGenerationState,
  checkRateLimit,
  // ConfiguraÃ§Ãµes exportadas para customizaÃ§Ã£o
  RETRY_CONFIG,
  RATE_LIMIT_CONFIG,
  SELECTORS
};
