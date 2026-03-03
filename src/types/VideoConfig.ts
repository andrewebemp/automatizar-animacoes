/**
 * Formatos de vídeo suportados com seus aspect ratios.
 */
export type AspectRatio = '16:9' | '9:16' | '1:1';

/**
 * Configurações de vídeo para cada formato.
 */
export interface VideoFormatConfig {
  width: number;
  height: number;
  aspectRatio: AspectRatio;
  label: string;
}

/**
 * Mapeamento dos formatos disponíveis.
 */
export const VIDEO_FORMATS: Record<AspectRatio, VideoFormatConfig> = {
  '16:9': {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    label: 'Horizontal (16:9)',
  },
  '9:16': {
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    label: 'Vertical (9:16)',
  },
  '1:1': {
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    label: 'Quadrado (1:1)',
  },
};

/**
 * Configurações de vídeo do projeto.
 */
export interface VideoConfig {
  /** Frames por segundo */
  fps: number;

  /** Largura do vídeo em pixels */
  width: number;

  /** Altura do vídeo em pixels */
  height: number;

  /** Aspect ratio selecionado */
  aspectRatio: AspectRatio;
}

/**
 * Configuração padrão de vídeo.
 */
export const DEFAULT_VIDEO_CONFIG: VideoConfig = {
  fps: 30,
  width: 1920,
  height: 1080,
  aspectRatio: '16:9',
};
