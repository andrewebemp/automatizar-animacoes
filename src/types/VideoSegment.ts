import type { Region } from './Region';

/**
 * Modo de exibição do elemento
 */
export type DisplayMode =
  | 'normal'    // Revela na imagem original, mantendo contexto visual
  | 'zoom';     // Cria cena com zoom, recortando região em 16:9 e exibindo em tela cheia

/**
 * Direção da animação de revelação
 */
export type RevealDirection =
  | 'auto'      // Automático baseado na posição do elemento
  | 'center'    // Do centro para fora
  | 'left'      // Da esquerda para direita
  | 'right'     // Da direita para esquerda
  | 'top'       // De cima para baixo
  | 'bottom';   // De baixo para cima

/**
 * Representa um segmento de vídeo que corresponde a UMA legenda do SRT.
 * Cada segmento revela uma região específica da imagem.
 */
export interface VideoSegment {
  /** Identificador único do segmento */
  id: string;

  /** Índice da legenda no array de subtitles (link para o SRT) */
  subtitleIndex: number;

  /** Região a ser revelada (null se ainda não definida) */
  region: Region | null;

  /** Modo de exibição do elemento */
  displayMode: DisplayMode;

  /** Direção do reveal animation */
  revealDirection: RevealDirection;

  /** Duração do reveal como fração (0.0 a 1.0) do tempo total do segmento */
  revealFraction: number;

  /** Fator de escala do elemento (1.0 = tamanho original, 1.1 = 10% maior, 0.9 = 10% menor) */
  scale?: number;

  /** Deslocamento horizontal do elemento em pixels (coordenadas da imagem original) */
  offsetX?: number;

  /** Deslocamento vertical do elemento em pixels (coordenadas da imagem original) */
  offsetY?: number;
}

/**
 * Cria um VideoSegment padrão para uma legenda
 */
export function createVideoSegment(subtitleIndex: number): VideoSegment {
  return {
    id: `segment-${subtitleIndex}-${Date.now()}`,
    subtitleIndex,
    region: null,
    displayMode: 'normal',
    revealDirection: 'auto',
    revealFraction: 0.6, // 60% do tempo do segmento para o reveal (padrão)
  };
}

/**
 * Verifica se um segmento tem região definida
 */
export function hasRegion(segment: VideoSegment): boolean {
  return segment.region !== null && segment.region.pathData.length > 0;
}
