/**
 * Sistema de persistência do projeto
 * Usa IndexedDB para imagens (grandes) e localStorage para metadados
 */

import type { WizardStep, VideoResolution } from '../types/ProjectData';
import type { ImageBlock } from '../types/ImageBlock';
import type { Subtitle } from '../types/Subtitle';

const PROJECT_STORAGE_KEY = 'automatizar-animacoes-project';
const DB_NAME = 'automatizar-animacoes-db';
const DB_VERSION = 2;
const IMAGES_STORE = 'images';
const AUDIO_STORE = 'audio';

/**
 * Dados salvos do projeto (sem as imagens base64)
 */
export interface SavedProjectData {
  /** Versão do formato de salvamento */
  version: number;
  /** Data/hora do salvamento */
  savedAt: string;
  /** Step atual do wizard */
  currentStep: WizardStep;
  /** Conteúdo do SRT */
  srtContent?: string;
  /** URL do áudio (referência para IndexedDB ou ausente) */
  audioUrl?: string;
  /** Legendas parseadas */
  subtitles: Subtitle[];
  /** Blocos de imagem com detecções (imagens armazenadas separadamente) */
  imageBlocks: ImageBlock[];
  /** Resolução selecionada */
  selectedResolution: VideoResolution;
  /** Mostrar legendas no vídeo */
  showSubtitlesInVideo: boolean;
  /** FPS do projeto */
  fps: number;
}

const CURRENT_VERSION = 2;

/**
 * Abre conexão com IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[ProjectStorage] Erro ao abrir IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE, { keyPath: 'blockId' });
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Salva uma imagem no IndexedDB
 */
async function saveImageToDB(blockId: string, imageData: ImageBlock['image']): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([IMAGES_STORE], 'readwrite');
    const store = transaction.objectStore(IMAGES_STORE);
    const request = store.put({ blockId, ...imageData });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Carrega uma imagem do IndexedDB
 */
async function loadImageFromDB(blockId: string): Promise<ImageBlock['image'] | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([IMAGES_STORE], 'readonly');
    const store = transaction.objectStore(IMAGES_STORE);
    const request = store.get(blockId);

    request.onsuccess = () => {
      if (request.result) {
        const { blockId: _, ...imageData } = request.result;
        resolve(imageData as ImageBlock['image']);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Limpa todas as imagens do IndexedDB
 */
async function clearImagesFromDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([IMAGES_STORE], 'readwrite');
    const store = transaction.objectStore(IMAGES_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva áudio no IndexedDB
 */
async function saveAudioToDB(audioUrl: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE], 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.put({ id: 'project-audio', url: audioUrl });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Carrega áudio do IndexedDB
 */
async function loadAudioFromDB(): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE], 'readonly');
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.get('project-audio');

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.url);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Limpa áudio do IndexedDB
 */
async function clearAudioFromDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE], 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Prepara imageBlocks para salvamento (remove dados base64 grandes)
 */
function prepareBlocksForSave(blocks: ImageBlock[]): ImageBlock[] {
  return blocks.map(block => ({
    ...block,
    // Mantém referência mas remove a URL base64 grande
    image: block.image ? {
      url: `indexeddb:${block.id}`, // Referência para carregar depois
      width: block.image.width,
      height: block.image.height,
    } : undefined,
  }));
}

/**
 * Salva o projeto
 */
export async function saveProject(data: Omit<SavedProjectData, 'version' | 'savedAt'>): Promise<boolean> {
  try {
    // Primeiro, salvar imagens no IndexedDB
    for (const block of data.imageBlocks) {
      if (block.image && !block.image.url.startsWith('indexeddb:')) {
        await saveImageToDB(block.id, block.image);
      }
    }

    // Salvar áudio no IndexedDB se existir
    if (data.audioUrl && !data.audioUrl.startsWith('indexeddb:')) {
      await saveAudioToDB(data.audioUrl);
    }

    // Preparar dados sem as imagens/áudio base64
    const saveData: SavedProjectData = {
      ...data,
      imageBlocks: prepareBlocksForSave(data.imageBlocks),
      audioUrl: data.audioUrl ? 'indexeddb:project-audio' : undefined,
      version: CURRENT_VERSION,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(saveData));
    console.log('[ProjectStorage] Projeto salvo com sucesso:', saveData.savedAt);
    return true;
  } catch (error) {
    console.error('[ProjectStorage] Erro ao salvar projeto:', error);
    return false;
  }
}

/**
 * Carrega o projeto
 */
export async function loadProject(): Promise<SavedProjectData | null> {
  try {
    const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!stored) {
      console.log('[ProjectStorage] Nenhum projeto salvo encontrado');
      return null;
    }

    const data = JSON.parse(stored) as SavedProjectData;

    // Verificar se é um SavedProjectData válido (tem versão)
    if (!data || typeof data !== 'object' || !('version' in data)) {
      console.warn('[ProjectStorage] Dados inválidos no localStorage, ignorando');
      localStorage.removeItem(PROJECT_STORAGE_KEY);
      return null;
    }

    // Aceitar versão 1 ou 2
    if (data.version !== CURRENT_VERSION && data.version !== 1) {
      console.warn('[ProjectStorage] Versão incompatível:', data.version);
      return null;
    }

    // Restaurar imagens do IndexedDB
    const blocksWithImages = await Promise.all(
      data.imageBlocks.map(async (block) => {
        if (block.image?.url.startsWith('indexeddb:')) {
          const imageData = await loadImageFromDB(block.id);
          return {
            ...block,
            image: imageData || undefined,
          };
        }
        return block;
      })
    );

    // Restaurar áudio do IndexedDB
    let audioUrl = data.audioUrl;
    if (audioUrl?.startsWith('indexeddb:')) {
      audioUrl = await loadAudioFromDB() || undefined;
    }

    console.log('[ProjectStorage] Projeto carregado:', data.savedAt);
    return {
      ...data,
      imageBlocks: blocksWithImages,
      audioUrl,
    };
  } catch (error) {
    console.error('[ProjectStorage] Erro ao carregar projeto:', error);
    return null;
  }
}

/**
 * Remove o projeto salvo
 */
export async function clearSavedProject(): Promise<void> {
  try {
    localStorage.removeItem(PROJECT_STORAGE_KEY);
    await clearImagesFromDB();
    await clearAudioFromDB();
    console.log('[ProjectStorage] Projeto removido');
  } catch (error) {
    console.error('[ProjectStorage] Erro ao remover projeto:', error);
  }
}

/**
 * Verifica se existe um projeto salvo
 */
export function hasSavedProject(): boolean {
  try {
    return localStorage.getItem(PROJECT_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Obtém informações resumidas do projeto salvo
 */
export function getSavedProjectInfo(): { savedAt: string; step: WizardStep; imageCount: number } | null {
  try {
    const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored) as SavedProjectData;

    // Verificar se é um SavedProjectData válido
    if (!data || typeof data !== 'object' || !('version' in data) || !data.savedAt) {
      return null;
    }

    return {
      savedAt: data.savedAt,
      step: data.currentStep,
      imageCount: data.imageBlocks?.filter(b => b.image).length || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Auto-save (versão simplificada - salva apenas metadados sem imagens)
 */
export function autoSaveProject(data: Omit<SavedProjectData, 'version' | 'savedAt'>): void {
  // Auto-save agora chama saveProject de forma assíncrona
  saveProject(data).catch(err => {
    console.warn('[ProjectStorage] Auto-save falhou:', err);
  });
}

/**
 * Formata data para exibição
 */
export function formatSavedDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}
