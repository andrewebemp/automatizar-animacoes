/**
 * Módulo de monitoramento de pasta para integração com Genspark Nanobanana
 * Detecta novas imagens adicionadas à pasta de download
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

let activeWatcher = null;

/**
 * Inicia monitoramento de uma pasta para novas imagens
 * @param {string} folderPath - Caminho da pasta a monitorar
 * @param {function} onNewImage - Callback quando nova imagem é detectada
 * @param {function} onError - Callback para erros
 * @returns {object} - Objeto watcher para controle
 */
function startWatching(folderPath, onNewImage, onError) {
  // Para watcher anterior se existir
  if (activeWatcher) {
    stopWatching();
  }

  // Cria pasta se não existir
  if (!fs.existsSync(folderPath)) {
    try {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`[FolderWatcher] Pasta criada: ${folderPath}`);
    } catch (err) {
      if (onError) onError(`Erro ao criar pasta: ${err.message}`);
      return null;
    }
  }

  console.log(`[FolderWatcher] Iniciando monitoramento: ${folderPath}`);

  activeWatcher = chokidar.watch(folderPath, {
    ignored: /^\.|thumbs\.db|desktop\.ini/i,
    persistent: true,
    ignoreInitial: true, // Não dispara para arquivos existentes
    awaitWriteFinish: {
      stabilityThreshold: 2000, // Aguarda 2s após última escrita
      pollInterval: 100
    },
    depth: 0, // Apenas pasta raiz, não subpastas
  });

  // Quando arquivo é adicionado
  activeWatcher.on('add', (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      console.log(`[FolderWatcher] Nova imagem detectada: ${filePath}`);

      // Lê imagem como base64
      try {
        const imageBuffer = fs.readFileSync(filePath);
        const base64 = imageBuffer.toString('base64');
        const mimeType = ext === '.png' ? 'image/png' :
                         ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        if (onNewImage) {
          onNewImage({
            filePath,
            fileName: path.basename(filePath),
            dataUrl,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.error(`[FolderWatcher] Erro ao ler imagem: ${err.message}`);
        if (onError) onError(`Erro ao ler imagem: ${err.message}`);
      }
    }
  });

  // Erros do watcher
  activeWatcher.on('error', (error) => {
    console.error(`[FolderWatcher] Erro: ${error.message}`);
    if (onError) onError(error.message);
  });

  // Ready
  activeWatcher.on('ready', () => {
    console.log(`[FolderWatcher] Pronto para monitorar`);
  });

  return activeWatcher;
}

/**
 * Para o monitoramento ativo
 */
async function stopWatching() {
  if (activeWatcher) {
    console.log('[FolderWatcher] Parando monitoramento');
    await activeWatcher.close();
    activeWatcher = null;
  }
}

/**
 * Lista imagens existentes em uma pasta
 * @param {string} folderPath - Caminho da pasta
 * @returns {Array} - Lista de objetos com info das imagens
 */
function listExistingImages(folderPath) {
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  const files = fs.readdirSync(folderPath);
  const images = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);

      try {
        const imageBuffer = fs.readFileSync(filePath);
        const base64 = imageBuffer.toString('base64');
        const mimeType = ext === '.png' ? 'image/png' :
                         ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        images.push({
          filePath,
          fileName: file,
          dataUrl,
          timestamp: stats.mtimeMs,
          size: stats.size
        });
      } catch (err) {
        console.warn(`[FolderWatcher] Erro ao ler ${file}: ${err.message}`);
      }
    }
  }

  // Ordena por nome do arquivo (01.png, 02.png, etc)
  images.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));

  return images;
}

/**
 * Verifica se uma pasta existe
 * @param {string} folderPath - Caminho da pasta
 * @returns {boolean}
 */
function folderExists(folderPath) {
  return fs.existsSync(folderPath);
}

/**
 * Cria uma pasta se não existir
 * @param {string} folderPath - Caminho da pasta
 * @returns {boolean} - true se criada ou já existe
 */
function ensureFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    try {
      fs.mkdirSync(folderPath, { recursive: true });
      return true;
    } catch (err) {
      console.error(`[FolderWatcher] Erro ao criar pasta: ${err.message}`);
      return false;
    }
  }
  return true;
}

module.exports = {
  startWatching,
  stopWatching,
  listExistingImages,
  folderExists,
  ensureFolder
};
