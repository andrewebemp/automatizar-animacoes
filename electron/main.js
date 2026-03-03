const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// Desabilita aviso de segurança em desenvolvimento
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let mainWindow;
let renderProgress = { progress: 0, status: 'idle' };

function createWindow() {
  const isDev = !app.isPackaged;

  // Caminho do preload
  const preloadPath = path.join(__dirname, 'preload.js');

  console.log('=== Electron Debug ===');
  console.log('isDev:', isDev);
  console.log('__dirname:', __dirname);
  console.log('preloadPath:', preloadPath);
  console.log('preload exists:', fs.existsSync(preloadPath));

  // Obtém o tamanho da tela principal
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Calcula o tamanho da janela (90% da tela, respeitando mínimos e máximos)
  const desiredWidth = 1400;
  const desiredHeight = 900;
  const minWidth = 1200;
  const minHeight = 700;

  // Usa o menor entre o desejado e 95% da tela disponível
  const windowWidth = Math.min(desiredWidth, Math.floor(screenWidth * 0.95));
  const windowHeight = Math.min(desiredHeight, Math.floor(screenHeight * 0.95));

  // Garante que não seja menor que o mínimo (ou ajusta o mínimo se a tela for muito pequena)
  const finalWidth = Math.max(Math.min(minWidth, screenWidth - 50), windowWidth);
  const finalHeight = Math.max(Math.min(minHeight, screenHeight - 50), windowHeight);
  const finalMinWidth = Math.min(minWidth, screenWidth - 50);
  const finalMinHeight = Math.min(minHeight, screenHeight - 50);

  console.log(`Screen size: ${screenWidth}x${screenHeight}`);
  console.log(`Window size: ${finalWidth}x${finalHeight}`);

  mainWindow = new BrowserWindow({
    width: finalWidth,
    height: finalHeight,
    minWidth: finalMinWidth,
    minHeight: finalMinHeight,
    title: 'Automatizar Animações - Editor',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      sandbox: false,
    },
    backgroundColor: '#1a1a2e',
    show: false,
    center: true, // Centraliza a janela na tela
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/editor/index.html'));
  }

  // Atalho para abrir DevTools em produção (Ctrl+Shift+I ou F12)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers para operações de arquivo
ipcMain.handle('open-file-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('save-file-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Prepara os dados do projeto para renderização.
 * NOTA: Remotion NÃO suporta URLs file:// - apenas http://, https:// e data: URLs.
 * Por isso, mantemos as imagens como base64 (data: URLs) que funcionam corretamente.
 * Para o áudio, também mantemos como base64.
 */
async function prepareProjectImages(projectData, tempDir) {
  // Não precisamos converter para arquivos - Remotion aceita data: URLs
  // Apenas fazemos uma cópia dos dados para não modificar o original
  const processedData = JSON.parse(JSON.stringify(projectData));

  // Log para debug
  if (processedData.imageUrl) {
    const isDataUrl = processedData.imageUrl.startsWith('data:');
    console.log(`Imagem principal: ${isDataUrl ? 'data URL' : processedData.imageUrl.substring(0, 50)}`);
  }

  if (processedData.imageBlocks && Array.isArray(processedData.imageBlocks)) {
    console.log(`Total de imageBlocks: ${processedData.imageBlocks.length}`);
    processedData.imageBlocks.forEach((block, i) => {
      // CORREÇÃO DEFINITIVA: Garante que o objeto image existe e tem dimensões válidas
      if (!block.image) {
        console.error(`[CORREÇÃO] Bloco ${i} não tinha objeto image - criando objeto com fallback`);
        block.image = { url: '', width: 1920, height: 1080 };
      }

      // Garante que width e height são números válidos
      if (!block.image.width || typeof block.image.width !== 'number' || block.image.width <= 0) {
        console.warn(`[CORREÇÃO] Bloco ${i} tinha width inválido (${block.image.width}) - usando 1920`);
        block.image.width = 1920;
      }
      if (!block.image.height || typeof block.image.height !== 'number' || block.image.height <= 0) {
        console.warn(`[CORREÇÃO] Bloco ${i} tinha height inválido (${block.image.height}) - usando 1080`);
        block.image.height = 1080;
      }

      // Garante que url é uma string
      if (!block.image.url || typeof block.image.url !== 'string') {
        console.warn(`[CORREÇÃO] Bloco ${i} tinha url inválida - usando string vazia`);
        block.image.url = '';
      }

      const isDataUrl = block.image.url.startsWith('data:');
      console.log(`Bloco ${i}: ${isDataUrl ? 'data URL' : block.image.url.substring(0, 50)} (${block.image.width}x${block.image.height})`);
    });
  }

  if (processedData.audioUrl) {
    const isDataUrl = processedData.audioUrl.startsWith('data:');
    console.log(`Áudio: ${isDataUrl ? 'data URL' : processedData.audioUrl.substring(0, 50)}`);
  }

  return { processedData, tempFiles: [] };
}

// Renderização de vídeo com Remotion
ipcMain.handle('render-video', async (event, { projectData, outputPath }) => {
  let puppeteerInstance = null;

  try {
    renderProgress = { progress: 0, status: 'bundling' };
    mainWindow?.webContents.send('render-progress', renderProgress);

    // Detecta o modo (Timeline ou SRT)
    const isTimelineMode = projectData.useTimelineMode === true;

    console.log('=== Iniciando Renderização ===');
    console.log('Output path:', outputPath);
    console.log('Modo Timeline:', isTimelineMode);

    // Verifica se o diretório de destino existe
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      console.log('Criando diretório de destino:', outputDir);
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Prepara os dados do projeto
    const project = projectData.useVideoNew || projectData.useTimelineMode ? projectData.project : projectData;
    const videoConfig = projectData.videoConfig || project.videoConfig || { width: 1920, height: 1080, fps: 30 };
    let durationInFrames = 300;

    if (isTimelineMode) {
      // Modo Timeline: duração baseada no áudio
      const audioDuration = project.audioDuration || 0;
      durationInFrames = Math.ceil((audioDuration / 1000) * (videoConfig.fps || 30));
      if (durationInFrames < 30) durationInFrames = 300; // fallback mínimo
      console.log('Duração do áudio (ms):', audioDuration);
    } else {
      // Modo SRT: duração baseada nas legendas
      const subtitles = project.subtitles || [];
      if (subtitles.length > 0) {
        const lastSubtitle = subtitles[subtitles.length - 1];
        durationInFrames = (lastSubtitle.endFrame || 300) + (videoConfig.fps || 30);
      }
    }

    // Log de debug
    console.log('Projeto:', {
      scenes: project.scenes?.length || 0,
      isTimelineMode,
      videoConfig,
      durationInFrames,
    });

    // Valida as cenas - garante que todas têm dimensões válidas
    if (project.scenes) {
      project.scenes.forEach((scene, i) => {
        // Garante dimensões válidas em cada cena
        if (!scene.imageWidth || scene.imageWidth <= 0) {
          scene.imageWidth = 1920;
        }
        if (!scene.imageHeight || scene.imageHeight <= 0) {
          scene.imageHeight = 1080;
        }
        console.log(`Cena ${i}:`, {
          id: scene.id,
          hasUrl: !!scene.imageUrl,
          width: scene.imageWidth,
          height: scene.imageHeight,
          // Timeline usa elements, SRT usa segments
          elements: isTimelineMode ? (scene.elements?.length || 0) : (scene.segments?.length || 0),
        });
      });
    }

    // Escolhe a composição baseada no modo
    const compositionId = isTimelineMode ? 'VideoTimeline' : 'VideoNew';
    const inputProps = { project };

    console.log('Duração calculada:', durationInFrames, 'frames');
    console.log('Composição:', compositionId);

    // Importa módulos Remotion dinamicamente
    const { bundle } = require('@remotion/bundler');
    const { renderMedia, selectComposition, ensureBrowser, openBrowser } = require('@remotion/renderer');

    // Determina o caminho do entry point
    const isDev = !app.isPackaged;
    let entryPoint;

    if (isDev) {
      entryPoint = path.join(__dirname, '../src/index.ts');
    } else {
      entryPoint = path.join(process.resourcesPath, 'src/index.ts');
    }

    if (!fs.existsSync(entryPoint)) {
      throw new Error(`Entry point não encontrado: ${entryPoint}`);
    }

    // Garante que o browser está disponível
    console.log('Verificando browser...');
    try {
      await ensureBrowser();
      console.log('Browser verificado');
    } catch (browserError) {
      console.warn('Aviso browser:', browserError.message);
    }

    console.log('Abrindo browser...');
    puppeteerInstance = await openBrowser('chrome-headless-shell', {
      shouldDumpIo: false,
    });
    console.log('Browser aberto');

    // Cria o bundle
    console.log('Criando bundle...');
    console.log('Entry point:', entryPoint);

    let bundleLocation;
    try {
      bundleLocation = await bundle({
        entryPoint,
        onProgress: (progress) => {
          renderProgress = { progress: progress * 20, status: 'bundling' };
          mainWindow?.webContents.send('render-progress', renderProgress);
        },
        ignoreRegisterRootWarning: true,
        publicDir: null,
      });
    } catch (bundleError) {
      console.error('Erro no bundle:', bundleError);
      throw new Error(`Falha ao criar bundle: ${bundleError.message}`);
    }

    console.log('Bundle criado em:', bundleLocation);
    renderProgress = { progress: 20, status: 'preparing' };
    mainWindow?.webContents.send('render-progress', renderProgress);

    // Seleciona a composição
    const serverPort = Math.floor(Math.random() * 50000) + 10000;
    console.log('Selecionando composição:', compositionId);

    let composition;
    try {
      composition = await selectComposition({
        serveUrl: bundleLocation,
        id: compositionId,
        inputProps,
        timeoutInMilliseconds: 180000,
        puppeteerInstance,
        chromiumOptions: {
          enableMultiProcessOnLinux: false,
        },
        port: serverPort,
      });
    } catch (selectError) {
      console.error('Erro ao selecionar composição:', selectError);
      throw new Error(`Falha ao selecionar composição: ${selectError.message}`);
    }

    console.log('Composição selecionada:', composition.id);

    // Sobrescreve as configurações
    const compositionWithConfig = {
      ...composition,
      width: videoConfig.width,
      height: videoConfig.height,
      fps: videoConfig.fps,
      durationInFrames,
    };

    console.log('Iniciando renderização...');
    console.log('Configuração:', {
      width: compositionWithConfig.width,
      height: compositionWithConfig.height,
      fps: compositionWithConfig.fps,
      durationInFrames: compositionWithConfig.durationInFrames,
    });
    renderProgress = { progress: 25, status: 'rendering' };
    mainWindow?.webContents.send('render-progress', renderProgress);

    // Renderiza o vídeo com timeout aumentado
    // Usa outra porta aleatória para evitar conflitos
    const renderPort = Math.floor(Math.random() * 50000) + 10000;
    console.log('Porta do servidor de renderização:', renderPort);

    await renderMedia({
      composition: compositionWithConfig,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps, // Usa o inputProps correto (project ou projectData)
      timeoutInMilliseconds: 300000, // 5 minutos de timeout
      puppeteerInstance,
      chromiumOptions: {
        enableMultiProcessOnLinux: false,
      },
      port: renderPort, // Força porta aleatória
      onProgress: ({ progress }) => {
        const totalProgress = 25 + (progress * 75);
        renderProgress = { progress: totalProgress, status: 'rendering' };
        mainWindow?.webContents.send('render-progress', renderProgress);
      },
    });

    // Fecha o browser após a renderização
    await puppeteerInstance.close({ silent: false });

    // Verifica se o arquivo foi realmente criado
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log('Vídeo renderizado com sucesso:', outputPath);
      console.log('Tamanho do arquivo:', stats.size, 'bytes');
      renderProgress = { progress: 100, status: 'done' };
      mainWindow?.webContents.send('render-progress', renderProgress);
      return { success: true, outputPath };
    } else {
      console.error('ERRO: Arquivo não foi criado em:', outputPath);
      throw new Error(`Arquivo de vídeo não foi criado: ${outputPath}`);
    }
  } catch (error) {
    console.error('Erro na renderização:', error);

    // Garante que o browser seja fechado em caso de erro
    if (puppeteerInstance) {
      try {
        await puppeteerInstance.close({ silent: true });
        console.log('Browser fechado após erro');
      } catch (closeError) {
        console.warn('Erro ao fechar browser:', closeError);
      }
    }

    renderProgress = { progress: 0, status: 'error' };
    mainWindow?.webContents.send('render-progress', renderProgress);
    return { success: false, error: error.message };
  }
});

// Handler para obter progresso da renderização
ipcMain.handle('get-render-progress', () => {
  return renderProgress;
});

/**
 * Handler para salvar projeto de editor de vídeo
 * Salva o arquivo de projeto e opcionalmente copia as mídias
 */
ipcMain.handle('save-editor-project', async (event, { projectContent, projectPath, mediaHandling, mediaPaths, audioPath }) => {
  try {
    console.log('=== Salvando Projeto de Editor ===');
    console.log('Caminho:', projectPath);
    console.log('Modo de mídia:', mediaHandling);
    console.log('Mídias:', mediaPaths?.length || 0);

    // Cria o diretório se não existir
    const projectDir = path.dirname(projectPath);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Se modo 'copy', cria pasta de mídia e copia arquivos
    if (mediaHandling === 'copy') {
      const mediaDir = path.join(projectDir, 'media');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      console.log('Pasta de mídia:', mediaDir);

      // Copia cada mídia
      let mediaIndex = 0;
      for (const mediaPath of (mediaPaths || [])) {
        if (!mediaPath) continue;

        try {
          if (mediaPath.startsWith('data:')) {
            // Salva data URL como arquivo
            const matches = mediaPath.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const mimeType = matches[1];
              const base64Data = matches[2];
              const ext = mimeType.split('/')[1] || 'png';
              const fileName = `image_${mediaIndex}.${ext}`;
              const destPath = path.join(mediaDir, fileName);

              fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
              console.log(`Mídia ${mediaIndex} salva: ${fileName}`);
            }
          } else if (fs.existsSync(mediaPath)) {
            // Copia arquivo existente
            const fileName = path.basename(mediaPath);
            const destPath = path.join(mediaDir, fileName);
            fs.copyFileSync(mediaPath, destPath);
            console.log(`Mídia ${mediaIndex} copiada: ${fileName}`);
          }
        } catch (mediaError) {
          console.warn(`Aviso ao copiar mídia ${mediaIndex}:`, mediaError.message);
        }

        mediaIndex++;
      }

      // Copia áudio se existir
      if (audioPath) {
        try {
          if (audioPath.startsWith('data:')) {
            const matches = audioPath.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const mimeType = matches[1];
              const base64Data = matches[2];
              const ext = mimeType.split('/')[1] || 'mp3';
              const fileName = `audio.${ext}`;
              const destPath = path.join(mediaDir, fileName);

              fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
              console.log(`Áudio salvo: ${fileName}`);
            }
          } else if (fs.existsSync(audioPath)) {
            const fileName = path.basename(audioPath);
            const destPath = path.join(mediaDir, fileName);
            fs.copyFileSync(audioPath, destPath);
            console.log(`Áudio copiado: ${fileName}`);
          }
        } catch (audioError) {
          console.warn('Aviso ao copiar áudio:', audioError.message);
        }
      }
    }

    // Salva o arquivo de projeto
    fs.writeFileSync(projectPath, projectContent, 'utf-8');
    console.log('Projeto salvo com sucesso');

    return { success: true, projectPath };
  } catch (error) {
    console.error('Erro ao salvar projeto de editor:', error);
    return { success: false, error: error.message };
  }
});

// =============================================================================
// INTEGRAÇÃO GENSPARK - IPC Handlers
// =============================================================================

const folderWatcher = require('./folderWatcher');
const gensparkPlaywright = require('./gensparkPlaywright');

// --- Opção 1: Playwright (Automação Direta) ---

/**
 * Inicia geração automática de imagens via Playwright
 */
ipcMain.handle('genspark-playwright-start', async (event, config) => {
  try {
    console.log('=== Genspark Playwright: Iniciando ===');
    console.log('Prompts:', config.prompts?.length || 0);
    console.log('Aspect Ratio:', config.aspectRatio);

    // Callback de progresso
    const onProgress = (data) => {
      mainWindow?.webContents.send('genspark-progress', data);
    };

    // Callback quando imagem é gerada
    const onImageGenerated = (data) => {
      mainWindow?.webContents.send('genspark-image-generated', data);
    };

    // Callback de erro
    const onError = (data) => {
      mainWindow?.webContents.send('genspark-error', data);
    };

    const result = await gensparkPlaywright.generateImages({
      ...config,
      onProgress,
      onImageGenerated,
      onError
    });

    return { success: true, images: result };
  } catch (error) {
    console.error('Erro no Genspark Playwright:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Cancela geração em andamento
 */
ipcMain.handle('genspark-playwright-cancel', async () => {
  gensparkPlaywright.cancelGeneration();
  return { success: true };
});

/**
 * Lista perfis Chrome disponíveis
 */
ipcMain.handle('genspark-get-chrome-profiles', async () => {
  try {
    const profiles = gensparkPlaywright.listChromeProfiles();
    return { success: true, profiles };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Verifica se há automação em andamento
 */
ipcMain.handle('genspark-playwright-is-running', async () => {
  return { running: gensparkPlaywright.isRunning() };
});

// --- Opção 2: Extensão (File Watcher) ---

/**
 * Exporta prompts no formato da extensão Nanobanana
 */
ipcMain.handle('genspark-export-prompts', async (event, { prompts, filePath }) => {
  try {
    // Formata no padrão esperado pela extensão (blocos ```)
    const content = prompts.map((prompt, i) =>
      `=== IMAGEM ${i + 1} ===\n\nPrompt completo:\n\`\`\`\n${prompt}\n\`\`\``
    ).join('\n\n\n' + '='.repeat(50) + '\n\n\n');

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('[Genspark] Prompts exportados:', filePath);

    return { success: true, filePath };
  } catch (error) {
    console.error('[Genspark] Erro ao exportar prompts:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Inicia monitoramento de pasta para imagens
 */
ipcMain.handle('genspark-watch-folder', async (event, folderPath) => {
  try {
    console.log('[Genspark] Iniciando watch:', folderPath);

    // Callback quando nova imagem é detectada
    const onNewImage = (imageData) => {
      console.log('[Genspark] Nova imagem detectada:', imageData.fileName);
      mainWindow?.webContents.send('genspark-image-detected', imageData);
    };

    // Callback de erro
    const onError = (message) => {
      console.error('[Genspark] Erro no watcher:', message);
      mainWindow?.webContents.send('genspark-watcher-error', { message });
    };

    folderWatcher.startWatching(folderPath, onNewImage, onError);

    return { success: true };
  } catch (error) {
    console.error('[Genspark] Erro ao iniciar watch:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Para monitoramento de pasta
 */
ipcMain.handle('genspark-stop-watch', async () => {
  try {
    await folderWatcher.stopWatching();
    console.log('[Genspark] Watch parado');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Lista imagens existentes em uma pasta
 */
ipcMain.handle('genspark-get-folder-images', async (event, folderPath) => {
  try {
    const images = folderWatcher.listExistingImages(folderPath);
    return { success: true, images };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Verifica se pasta existe
 */
ipcMain.handle('genspark-folder-exists', async (event, folderPath) => {
  return { exists: folderWatcher.folderExists(folderPath) };
});

/**
 * Cria pasta se não existir
 */
ipcMain.handle('genspark-ensure-folder', async (event, folderPath) => {
  const created = folderWatcher.ensureFolder(folderPath);
  return { success: created };
});

/**
 * Abre diálogo para selecionar pasta
 */
ipcMain.handle('genspark-select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar Pasta para Imagens do Genspark',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  return { success: true, folderPath: result.filePaths[0] };
});
