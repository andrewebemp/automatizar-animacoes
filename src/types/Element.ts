/**
 * Tipos de forma suportados para elementos
 */
export type ElementShape = 'rect' | 'ellipse' | 'polygon' | 'freehand';

/**
 * Representa um elemento (sub-região) dentro de uma cena.
 * Os elementos são revelados progressivamente conforme a narração.
 */
export interface Element {
  /** Identificador único do elemento */
  id: string;

  /** Nome/label do elemento para identificação no editor */
  label: string;

  /** Posição X relativa à cena pai (0-1) - ponto inicial ou centro */
  x: number;

  /** Posição Y relativa à cena pai (0-1) - ponto inicial ou centro */
  y: number;

  /** Largura relativa à cena pai (0-1) - para rect e ellipse */
  width: number;

  /** Altura relativa à cena pai (0-1) - para rect e ellipse */
  height: number;

  /** Índice da legenda vinculada a este elemento */
  subtitleIndex: number;

  /** Tipo de forma do elemento */
  shape: ElementShape;

  /** Pontos para polygon e freehand [x1, y1, x2, y2, ...] em coordenadas relativas (0-1) */
  points?: number[];
}
