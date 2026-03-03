import type { ProjectData } from '../types/ProjectData';

const PROJECT_STORAGE_KEY = 'automatizar-animacoes-legacy-project';

/**
 * Salva o projeto no localStorage
 */
export function saveProject(project: ProjectData): void {
  try {
    const serialized = JSON.stringify(project);
    localStorage.setItem(PROJECT_STORAGE_KEY, serialized);
    console.log('[Persistence] Project saved');
  } catch (error) {
    console.error('[Persistence] Failed to save project:', error);
  }
}

/**
 * Carrega o projeto do localStorage
 */
export function loadProject(): ProjectData | null {
  try {
    const serialized = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (serialized) {
      const project = JSON.parse(serialized) as ProjectData;
      // Validate that this is a ProjectData object (not SavedProjectData from wizard)
      if (project && typeof project === 'object' && !('version' in project)) {
        console.log('[Persistence] Project loaded');
        return project;
      }
      console.log('[Persistence] Found incompatible data format, ignoring');
      return null;
    }
  } catch (error) {
    console.error('[Persistence] Failed to load project:', error);
  }
  return null;
}

/**
 * Limpa o projeto salvo do localStorage
 */
export function clearSavedProject(): void {
  try {
    localStorage.removeItem(PROJECT_STORAGE_KEY);
    console.log('[Persistence] Project cleared');
  } catch (error) {
    console.error('[Persistence] Failed to clear project:', error);
  }
}

/**
 * Verifica se existe um projeto salvo
 */
export function hasSavedProject(): boolean {
  return localStorage.getItem(PROJECT_STORAGE_KEY) !== null;
}
