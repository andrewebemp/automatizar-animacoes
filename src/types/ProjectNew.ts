import type { Subtitle } from './Subtitle';
import type { ImageScene } from './ImageScene';

/**
 * Projeto simplificado para o novo fluxo.
 * Estrutura mais limpa com apenas os dados essenciais.
 */
export interface ProjectNew {
  /** Identificador único do projeto */
  id: string;

  /** Nome do projeto */
  name: string;

  /** Legendas importadas do arquivo SRT */
  subtitles: Subtitle[];

  /** Cenas do projeto (cada cena = 1 imagem com múltiplos segmentos) */
  scenes: ImageScene[];

  /** Configuração de vídeo */
  videoConfig: VideoConfig;

  /** URL do áudio (opcional, pode ser data URL) */
  audioUrl?: string;

  /** Cor de fundo do vídeo */
  backgroundColor: string;

  /** Mostrar legendas no vídeo exportado */
  showSubtitles: boolean;

  /** Data de criação */
  createdAt: string;

  /** Data de última modificação */
  updatedAt: string;
}

export interface VideoConfig {
  /** Largura do vídeo em pixels */
  width: number;

  /** Altura do vídeo em pixels */
  height: number;

  /** Frames por segundo */
  fps: number;
}

export type VideoResolution = '1080p' | '720p' | '480p' | '4K';

export const VIDEO_RESOLUTIONS: Record<VideoResolution, { width: number; height: number }> = {
  '4K': { width: 3840, height: 2160 },
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
  '480p': { width: 854, height: 480 },
};

/**
 * Cria um projeto vazio com configurações padrão
 */
export function createEmptyProjectNew(): ProjectNew {
  const now = new Date().toISOString();

  return {
    id: `project-${Date.now()}`,
    name: 'Novo Projeto',
    subtitles: [],
    scenes: [],
    videoConfig: {
      width: 1920,
      height: 1080,
      fps: 30,
    },
    audioUrl: undefined,
    backgroundColor: '#ffffff',
    showSubtitles: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Calcula a duração total do projeto em frames
 */
export function getProjectDurationFrames(project: ProjectNew): number {
  if (project.subtitles.length === 0) {
    return project.videoConfig.fps * 10; // 10 segundos padrão
  }

  const lastSubtitle = project.subtitles[project.subtitles.length - 1];
  // Adiciona 1 segundo após a última legenda
  return lastSubtitle.endFrame + project.videoConfig.fps;
}

/**
 * Calcula a duração total do projeto em segundos
 */
export function getProjectDurationSeconds(project: ProjectNew): number {
  return getProjectDurationFrames(project) / project.videoConfig.fps;
}

/**
 * Verifica se o projeto está pronto para exportação
 */
export function isProjectReadyForExport(project: ProjectNew): {
  ready: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (project.subtitles.length === 0) {
    issues.push('Nenhuma legenda importada');
  }

  if (project.scenes.length === 0) {
    issues.push('Nenhuma imagem adicionada');
  }

  // Verifica se todos os segmentos têm região definida
  let segmentsWithoutRegion = 0;
  for (const scene of project.scenes) {
    for (const segment of scene.segments) {
      if (!segment.region || !segment.region.pathData) {
        segmentsWithoutRegion++;
      }
    }
  }

  if (segmentsWithoutRegion > 0) {
    issues.push(`${segmentsWithoutRegion} elemento(s) sem região definida`);
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}
