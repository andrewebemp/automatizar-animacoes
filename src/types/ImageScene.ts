import type { VideoSegment } from './VideoSegment';
import { createVideoSegment } from './VideoSegment';

/**
 * Representa uma área apagada da imagem (ex: números [1], [2], etc.)
 * Cada stroke é um traço contínuo da borracha
 */
export interface ErasedStroke {
  /** Identificador único do traço */
  id: string;

  /** Pontos do traço (x, y em coordenadas da imagem original) */
  points: Array<{ x: number; y: number }>;

  /** Largura do traço da borracha em pixels */
  strokeWidth: number;
}

/**
 * Representa uma cena com uma imagem e múltiplos segmentos.
 * Uma imagem contém VÁRIOS elementos, cada um vinculado a uma legenda do SRT.
 */
export interface ImageScene {
  /** Identificador único da cena */
  id: string;

  /** URL da imagem (pode ser data URL ou http URL) */
  imageUrl: string;

  /** Largura original da imagem em pixels */
  imageWidth: number;

  /** Altura original da imagem em pixels */
  imageHeight: number;

  /**
   * Segmentos de vídeo nesta cena.
   * Cada segmento corresponde a uma legenda e uma região da imagem.
   */
  segments: VideoSegment[];

  /** Frame inicial desta cena (baseado no primeiro segmento) */
  startFrame: number;

  /** Frame final desta cena (baseado no último segmento) */
  endFrame: number;

  /** Áreas apagadas da imagem (traços da borracha) */
  erasedStrokes?: ErasedStroke[];
}

/**
 * Cria uma ImageScene vazia
 */
export function createEmptyScene(): ImageScene {
  return {
    id: `scene-${Date.now()}`,
    imageUrl: '',
    imageWidth: 0,
    imageHeight: 0,
    segments: [],
    startFrame: 0,
    endFrame: 0,
  };
}

/**
 * Cria uma ImageScene a partir de uma imagem e range de legendas
 */
export function createSceneFromImage(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number,
  subtitleStartIndex: number,
  subtitleEndIndex: number,
  fps: number = 30
): ImageScene {
  const segments: VideoSegment[] = [];

  for (let i = subtitleStartIndex; i <= subtitleEndIndex; i++) {
    segments.push(createVideoSegment(i));
  }

  return {
    id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    imageUrl,
    imageWidth,
    imageHeight,
    segments,
    startFrame: 0, // Será calculado baseado nas legendas
    endFrame: 0,   // Será calculado baseado nas legendas
  };
}

/**
 * Atualiza os frames de início e fim da cena baseado nas legendas
 */
export function updateSceneFrames(
  scene: ImageScene,
  subtitles: Array<{ startFrame: number; endFrame: number }>
): ImageScene {
  if (scene.segments.length === 0) {
    return scene;
  }

  const firstSegment = scene.segments[0];
  const lastSegment = scene.segments[scene.segments.length - 1];

  const firstSubtitle = subtitles[firstSegment.subtitleIndex];
  const lastSubtitle = subtitles[lastSegment.subtitleIndex];

  if (!firstSubtitle || !lastSubtitle) {
    return scene;
  }

  return {
    ...scene,
    startFrame: firstSubtitle.startFrame,
    endFrame: lastSubtitle.endFrame,
  };
}
