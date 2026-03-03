import type { Element } from './Element';

/**
 * Representa uma cena (região maior) na imagem.
 * Cada cena contém múltiplos elementos que são revelados progressivamente.
 * O aspect ratio da cena é forçado para corresponder ao formato de saída.
 */
export interface Scene {
  /** Identificador único da cena */
  id: string;

  /** Nome/label da cena para identificação no editor */
  label: string;

  /** Posição X relativa à imagem original (0-1) */
  x: number;

  /** Posição Y relativa à imagem original (0-1) */
  y: number;

  /** Largura relativa à imagem (0-1) - calculada pelo aspect ratio */
  width: number;

  /** Altura relativa à imagem (0-1) - calculada pelo aspect ratio */
  height: number;

  /** Elementos dentro desta cena */
  elements: Element[];

  /** URL da imagem própria da cena (opcional - se não definido, usa recorte da imagem principal) */
  imageUrl?: string;

  /** Dimensões da imagem própria da cena */
  imageDimensions?: {
    width: number;
    height: number;
  };
}
