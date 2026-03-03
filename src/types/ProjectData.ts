import type { Scene } from './Scene';
import type { Subtitle } from './Subtitle';
import type { VideoConfig } from './VideoConfig';
import type { ImageBlock } from './ImageBlock';

/**
 * Modo do projeto: novo fluxo SRT-first ou legacy manual
 */
export type ProjectMode = 'new-flow' | 'legacy';

/**
 * Configurações de modo manual por seção
 */
export interface ManualModeSettings {
  /** Força modo manual para transcrição (ignora Whisper API) */
  forceManualTranscription: boolean;
  /** Força modo manual para detecção de elementos (ignora Vision API) */
  forceManualDetection: boolean;
}

/**
 * Configurações padrão de modo manual
 */
export const DEFAULT_MANUAL_MODE: ManualModeSettings = {
  forceManualTranscription: false,
  forceManualDetection: false,
};

/**
 * Steps do wizard no novo fluxo
 */
export type WizardStep =
  | 'upload-script'
  | 'upload-srt'
  | 'review-prompts'
  | 'upload-images'
  | 'preview-validation'
  | 'export';

/**
 * Resoluções de vídeo suportadas
 */
export type VideoResolution = '360p' | '480p' | '720p' | '1080p' | '2k' | '4k';

/**
 * Configurações de resolução por aspect ratio
 */
export const VIDEO_RESOLUTIONS: Record<
  VideoResolution,
  Record<'16:9' | '9:16' | '1:1', { width: number; height: number }>
> = {
  '360p': {
    '16:9': { width: 640, height: 360 },
    '9:16': { width: 360, height: 640 },
    '1:1': { width: 360, height: 360 },
  },
  '480p': {
    '16:9': { width: 854, height: 480 },
    '9:16': { width: 480, height: 854 },
    '1:1': { width: 480, height: 480 },
  },
  '720p': {
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '1:1': { width: 720, height: 720 },
  },
  '1080p': {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
  },
  '2k': {
    '16:9': { width: 2560, height: 1440 },
    '9:16': { width: 1440, height: 2560 },
    '1:1': { width: 1440, height: 1440 },
  },
  '4k': {
    '16:9': { width: 3840, height: 2160 },
    '9:16': { width: 2160, height: 3840 },
    '1:1': { width: 2160, height: 2160 },
  },
};

/**
 * Configurações de estilo do reveal progressivo.
 */
export interface RevealStyle {
  /** Cor do fundo antes de revelar os elementos (hex) */
  backgroundColor: string;

  /** Duração do fade ao revelar cada elemento (em frames) */
  revealDuration: number;

  /** Duração do crossfade entre cenas (em frames) */
  crossfadeDuration: number;
}

/**
 * Estilo padrão do reveal.
 */
export const DEFAULT_REVEAL_STYLE: RevealStyle = {
  backgroundColor: '#FFFFFF',
  revealDuration: 10, // ~0.3 segundos a 30fps
  crossfadeDuration: 15, // ~0.5 segundos a 30fps
};

/**
 * Dados completos do projeto.
 */
export interface ProjectData {
  // ========== Novos campos para novo fluxo ==========

  /** Modo do projeto: novo fluxo ou legacy */
  mode: ProjectMode;

  /** Step atual do wizard (apenas para novo fluxo) */
  currentStep: WizardStep;

  /** Conteúdo original do SRT (preservado para reprocessamento) */
  srtContent?: string;

  /** Blocos de imagem gerados a partir do SRT (novo fluxo) */
  imageBlocks: ImageBlock[];

  /** Resolução de vídeo selecionada */
  selectedResolution: VideoResolution;

  /** Se deve mostrar legendas no vídeo renderizado */
  showSubtitlesInVideo: boolean;

  /** Configurações de modo manual */
  manualMode: ManualModeSettings;

  /** URL do áudio (base64 data URL) para usar no vídeo */
  audioUrl?: string;

  // ========== Campos existentes (legacy) ==========

  /** URL da imagem (base64 ou caminho) - usado no modo legacy */
  imageUrl: string;

  /** Dimensões originais da imagem - usado no modo legacy */
  imageDimensions: {
    width: number;
    height: number;
  };

  /** Cenas definidas na imagem - usado no modo legacy */
  scenes: Scene[];

  /** Legendas parseadas do arquivo SRT */
  subtitles: Subtitle[];

  /** Configurações do vídeo de saída */
  videoConfig: VideoConfig;

  /** Estilo do reveal progressivo */
  revealStyle: RevealStyle;
}

/**
 * Cria um projeto vazio com configurações padrão.
 */
export function createEmptyProject(): ProjectData {
  return {
    // Novos campos
    mode: 'new-flow',
    currentStep: 'upload-script',
    srtContent: undefined,
    imageBlocks: [],
    selectedResolution: '1080p',
    showSubtitlesInVideo: false,
    manualMode: { ...DEFAULT_MANUAL_MODE },

    // Campos existentes (legacy)
    imageUrl: '',
    imageDimensions: { width: 0, height: 0 },
    scenes: [],
    subtitles: [],
    videoConfig: {
      fps: 30,
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
    },
    revealStyle: { ...DEFAULT_REVEAL_STYLE },
  };
}

/**
 * Detecta o aspect ratio de uma imagem
 */
export function detectAspectRatio(
  width: number,
  height: number
): '16:9' | '9:16' | '1:1' {
  const ratio = width / height;

  if (Math.abs(ratio - 16 / 9) < 0.1) {
    return '16:9';
  } else if (Math.abs(ratio - 9 / 16) < 0.1) {
    return '9:16';
  } else if (Math.abs(ratio - 1) < 0.1) {
    return '1:1';
  }

  // Se não for um ratio padrão, escolhe o mais próximo
  if (ratio > 1.2) {
    return '16:9';
  } else if (ratio < 0.8) {
    return '9:16';
  }
  return '1:1';
}

/**
 * Obtém as dimensões do vídeo baseado na resolução e aspect ratio selecionados
 */
export function getVideoDimensions(
  resolution: VideoResolution,
  aspectRatio: '16:9' | '9:16' | '1:1'
): { width: number; height: number } {
  return VIDEO_RESOLUTIONS[resolution][aspectRatio];
}
