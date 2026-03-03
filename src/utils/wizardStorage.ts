/**
 * Sistema de persistência para o WizardAppNew
 * Usa IndexedDB para imagens grandes e localStorage para metadados
 */

import type { ProjectNew } from '../types/ProjectNew';
import type { TimelineProject } from '../types/TimelineProject';
import type { ImageScene } from '../types/ImageScene';

const DB_NAME = 'automatizar-animacoes-wizard-db';
const DB_VERSION = 1;
const SCENES_STORE = 'scenes';
const AUDIO_STORE = 'audio';
const TIMELINE_SCENES_STORE = 'timeline-scenes';

type WizardStep = 'import' | 'prompts' | 'imageGen' | 'images' | 'regions' | 'export';
type TimelineStep = 'import' | 'editor' | 'export';

/**
 * Abre conexão com IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[WizardStorage] Erro ao abrir IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SCENES_STORE)) {
        db.createObjectStore(SCENES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(TIMELINE_SCENES_STORE)) {
        db.createObjectStore(TIMELINE_SCENES_STORE, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Salva uma cena (com imagem) no IndexedDB
 */
async function saveSceneToDB(scene: ImageScene, storeName: string = SCENES_STORE): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(scene);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Carrega todas as cenas do IndexedDB
 */
async function loadScenesFromDB(storeName: string = SCENES_STORE): Promise<ImageScene[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Limpa todas as cenas do IndexedDB
 */
async function clearScenesFromDB(storeName: string = SCENES_STORE): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva áudio no IndexedDB
 */
async function saveAudioToDB(key: string, audioUrl: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE], 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.put({ key, url: audioUrl });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Carrega áudio do IndexedDB
 */
async function loadAudioFromDB(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIO_STORE], 'readonly');
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.get(key);

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

// ===== PROJETO SRT =====

const SRT_METADATA_KEY = 'automatizar-animacoes-srt-metadata';

interface SrtMetadata {
  step: WizardStep;
  subtitles: ProjectNew['subtitles'];
  videoConfig: ProjectNew['videoConfig'];
  showSubtitles: boolean;
  backgroundColor: string;
  name?: string;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  // IDs das cenas (as cenas completas estão no IndexedDB)
  sceneIds: string[];
  // Indica se tem áudio
  hasAudio: boolean;
}

/**
 * Salva projeto SRT (metadados no localStorage, imagens no IndexedDB)
 */
export async function saveSrtProject(
  step: WizardStep,
  project: ProjectNew
): Promise<boolean> {
  try {
    // Salva cada cena no IndexedDB (com imagem base64)
    await clearScenesFromDB(SCENES_STORE);
    for (const scene of project.scenes) {
      await saveSceneToDB(scene, SCENES_STORE);
    }

    // Salva áudio no IndexedDB se existir
    if (project.audioUrl) {
      await saveAudioToDB('srt-audio', project.audioUrl);
    }

    // Salva metadados no localStorage (sem imagens)
    const metadata: SrtMetadata = {
      step,
      subtitles: project.subtitles,
      videoConfig: project.videoConfig,
      showSubtitles: project.showSubtitles,
      backgroundColor: project.backgroundColor,
      name: project.name,
      sceneIds: project.scenes.map(s => s.id),
      hasAudio: !!project.audioUrl,
    };

    localStorage.setItem(SRT_METADATA_KEY, JSON.stringify(metadata));
    console.log('[WizardStorage] Projeto SRT salvo com sucesso');
    return true;
  } catch (error) {
    console.error('[WizardStorage] Erro ao salvar projeto SRT:', error);
    return false;
  }
}

/**
 * Carrega projeto SRT
 */
export async function loadSrtProject(): Promise<{ step: WizardStep; project: ProjectNew } | null> {
  try {
    const metadataStr = localStorage.getItem(SRT_METADATA_KEY);
    if (!metadataStr) {
      return null;
    }

    const metadata: SrtMetadata = JSON.parse(metadataStr);

    // Carrega cenas do IndexedDB
    const scenes = await loadScenesFromDB(SCENES_STORE);

    // Ordena as cenas conforme a ordem salva
    const orderedScenes = metadata.sceneIds
      .map(id => scenes.find(s => s.id === id))
      .filter((s): s is ImageScene => s !== undefined);

    // Carrega áudio do IndexedDB
    let audioUrl: string | undefined;
    if (metadata.hasAudio) {
      const audio = await loadAudioFromDB('srt-audio');
      audioUrl = audio || undefined;
    }

    const project: ProjectNew = {
      id: metadata.id || `srt-${Date.now()}`,
      subtitles: metadata.subtitles,
      scenes: orderedScenes,
      videoConfig: metadata.videoConfig,
      showSubtitles: metadata.showSubtitles,
      backgroundColor: metadata.backgroundColor || '#ffffff',
      audioUrl: audioUrl || '',
      name: metadata.name || 'Projeto SRT',
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: metadata.updatedAt || new Date().toISOString(),
    };

    console.log('[WizardStorage] Projeto SRT carregado');
    return { step: metadata.step, project };
  } catch (error) {
    console.error('[WizardStorage] Erro ao carregar projeto SRT:', error);
    return null;
  }
}

/**
 * Limpa projeto SRT salvo
 */
export async function clearSrtProject(): Promise<void> {
  try {
    localStorage.removeItem(SRT_METADATA_KEY);
    await clearScenesFromDB(SCENES_STORE);
    console.log('[WizardStorage] Projeto SRT limpo');
  } catch (error) {
    console.error('[WizardStorage] Erro ao limpar projeto SRT:', error);
  }
}

/**
 * Verifica se existe projeto SRT salvo
 */
export function hasSrtProject(): boolean {
  return localStorage.getItem(SRT_METADATA_KEY) !== null;
}

// ===== PROJETO TIMELINE =====

const TIMELINE_METADATA_KEY = 'automatizar-animacoes-timeline-metadata';

interface TimelineMetadata {
  step: TimelineStep;
  videoConfig: TimelineProject['videoConfig'];
  showSubtitles: boolean;
  backgroundColor: string;
  audioDuration: number;
  name?: string;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  // IDs das cenas (as cenas completas estão no IndexedDB)
  sceneIds: string[];
  // Indica se tem áudio
  hasAudio: boolean;
}

/**
 * Salva projeto Timeline (metadados no localStorage, imagens no IndexedDB)
 */
export async function saveTimelineProject(
  step: TimelineStep,
  project: TimelineProject
): Promise<boolean> {
  try {
    // Salva cada cena no IndexedDB
    await clearScenesFromDB(TIMELINE_SCENES_STORE);
    for (const scene of project.scenes) {
      // Converte TimelineScene para um formato salvável
      const sceneData = {
        ...scene,
        // Garante que todos os dados necessários estão presentes
      };
      await saveSceneToDB(sceneData as any, TIMELINE_SCENES_STORE);
    }

    // Salva áudio no IndexedDB se existir
    if (project.audioUrl) {
      await saveAudioToDB('timeline-audio', project.audioUrl);
    }

    // Salva metadados no localStorage (sem imagens)
    const metadata: TimelineMetadata = {
      step,
      videoConfig: project.videoConfig,
      showSubtitles: project.showSubtitles,
      backgroundColor: project.backgroundColor,
      audioDuration: project.audioDuration,
      name: project.name,
      sceneIds: project.scenes.map(s => s.id),
      hasAudio: !!project.audioUrl,
    };

    localStorage.setItem(TIMELINE_METADATA_KEY, JSON.stringify(metadata));
    console.log('[WizardStorage] Projeto Timeline salvo com sucesso');
    return true;
  } catch (error) {
    console.error('[WizardStorage] Erro ao salvar projeto Timeline:', error);
    return false;
  }
}

/**
 * Carrega projeto Timeline
 */
export async function loadTimelineProject(): Promise<{ step: TimelineStep; project: TimelineProject } | null> {
  try {
    const metadataStr = localStorage.getItem(TIMELINE_METADATA_KEY);
    if (!metadataStr) {
      return null;
    }

    const metadata: TimelineMetadata = JSON.parse(metadataStr);

    // Carrega cenas do IndexedDB
    const scenes = await loadScenesFromDB(TIMELINE_SCENES_STORE);

    // Ordena as cenas conforme a ordem salva
    const orderedScenes = metadata.sceneIds
      .map(id => scenes.find(s => s.id === id))
      .filter((s): s is any => s !== undefined);

    // Carrega áudio do IndexedDB
    let audioUrl = '';
    if (metadata.hasAudio) {
      const audio = await loadAudioFromDB('timeline-audio');
      audioUrl = audio || '';
    }

    const project: TimelineProject = {
      id: metadata.id || `timeline-${Date.now()}`,
      mode: 'timeline',
      scenes: orderedScenes,
      videoConfig: metadata.videoConfig,
      showSubtitles: metadata.showSubtitles,
      backgroundColor: metadata.backgroundColor || '#ffffff',
      audioDuration: metadata.audioDuration,
      audioUrl: audioUrl || '',
      name: metadata.name || 'Projeto Timeline',
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: metadata.updatedAt || new Date().toISOString(),
    };

    console.log('[WizardStorage] Projeto Timeline carregado');
    return { step: metadata.step, project };
  } catch (error) {
    console.error('[WizardStorage] Erro ao carregar projeto Timeline:', error);
    return null;
  }
}

/**
 * Limpa projeto Timeline salvo
 */
export async function clearTimelineProject(): Promise<void> {
  try {
    localStorage.removeItem(TIMELINE_METADATA_KEY);
    await clearScenesFromDB(TIMELINE_SCENES_STORE);
    console.log('[WizardStorage] Projeto Timeline limpo');
  } catch (error) {
    console.error('[WizardStorage] Erro ao limpar projeto Timeline:', error);
  }
}

/**
 * Verifica se existe projeto Timeline salvo
 */
export function hasTimelineProject(): boolean {
  return localStorage.getItem(TIMELINE_METADATA_KEY) !== null;
}

// ===== UTILITÁRIOS GERAIS =====

/**
 * Limpa todos os dados salvos
 */
export async function clearAllProjects(): Promise<void> {
  await clearSrtProject();
  await clearTimelineProject();
  await clearAudioFromDB();
}
