/**
 * Representa uma região desenhada na imagem.
 * O pathData (SVG path) é a FONTE DA VERDADE - o que você desenha É o que renderiza.
 */
export interface Region {
  /** Identificador único da região */
  id: string;

  /**
   * SVG path data - FONTE DA VERDADE para a forma
   * Ex: "M 10 10 L 100 10 L 100 100 L 10 100 Z"
   */
  pathData: string;

  /** Bounding box derivado do path (para otimização de renderização) */
  bounds: RegionBounds;

  /** Origem da região */
  source: RegionSource;
}

export interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RegionSource =
  | 'manual-rect'      // Desenhado manualmente como retângulo
  | 'manual-freehand'  // Desenhado manualmente à mão livre
  | 'ai-detected';     // Detectado por IA (Vision API)

/**
 * Cria uma região vazia
 */
export function createEmptyRegion(): Region {
  return {
    id: '',
    pathData: '',
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    source: 'manual-rect',
  };
}

/**
 * Verifica se uma região é válida (tem pathData)
 */
export function isValidRegion(region: Region | null | undefined): region is Region {
  return !!region && !!region.pathData && region.pathData.length > 0;
}
