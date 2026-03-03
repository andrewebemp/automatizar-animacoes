import type { ElementShape } from './Element';

/**
 * Direção da animação de reveal do elemento
 * - 'center': De dentro para fora (padrão atual)
 * - 'left': Da esquerda para direita
 * - 'right': Da direita para esquerda
 * - 'top': De cima para baixo
 * - 'bottom': De baixo para cima
 * - 'auto': Detecta automaticamente baseado na posição do elemento na tela
 */
export type RevealDirection = 'center' | 'left' | 'right' | 'top' | 'bottom' | 'auto';

/**
 * Opções de porcentagem de reveal (0-100% em incrementos de 10%)
 */
export type RevealPercentage = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;

/**
 * Modo de exibição do elemento no vídeo
 * - 'normal': Elemento revelado na imagem original (comportamento atual)
 * - 'zoom': Elemento vira cena própria com zoom (imagem cropada na proporção 16:9)
 */
export type ElementDisplayMode = 'normal' | 'zoom';

/**
 * Labels para exibição dos modos de display
 */
export const ELEMENT_DISPLAY_MODE_LABELS: Record<ElementDisplayMode, string> = {
  normal: 'Normal (revelar na imagem)',
  zoom: 'Cena com zoom (tela cheia)',
};

/**
 * Labels para exibição das direções de animação
 */
export const REVEAL_DIRECTION_LABELS: Record<RevealDirection, string> = {
  auto: 'Automático (baseado na posição)',
  center: 'Do centro para fora',
  left: 'Da esquerda para direita',
  right: 'Da direita para esquerda',
  top: 'De cima para baixo',
  bottom: 'De baixo para cima',
};

/**
 * Região identificada na imagem para um elemento.
 * Pode ser detectada automaticamente via Vision API ou desenhada manualmente.
 */
export interface ElementRegion {
  /** Posição X em pixels (absoluto) */
  x: number;
  /** Posição Y em pixels (absoluto) */
  y: number;
  /** Largura em pixels */
  width: number;
  /** Altura em pixels */
  height: number;
  /** Tipo de forma */
  shape: ElementShape;
  /** Pontos para polygon e freehand [x1, y1, x2, y2, ...] em pixels */
  points?: number[];
}

/**
 * Representa um elemento na timeline de um ImageBlock.
 * Cada elemento corresponde a uma legenda do SRT e será revelado no tempo correspondente.
 */
export interface TimelineElement {
  /** Identificador único do elemento */
  id: string;

  /** Índice da legenda no SRT (1-based, como no arquivo original) */
  subtitleIndex: number;

  /** Tempo de início em milissegundos */
  startTime: number;

  /** Tempo de fim em milissegundos */
  endTime: number;

  /** Frame de início (calculado a partir de startTime e FPS) */
  startFrame: number;

  /** Frame de fim (calculado a partir de endTime e FPS) */
  endFrame: number;

  /** Descrição do elemento visual a ser revelado */
  elementDescription: string;

  /** Texto da narração/legenda correspondente */
  narrationText: string;

  /** Região do elemento na imagem (detectada via Vision API ou desenhada manualmente) */
  region?: ElementRegion;

  /** Indica se a região foi detectada automaticamente ou desenhada manualmente */
  regionSource?: 'auto' | 'manual';

  /** Direção da animação de reveal (padrão: 'auto' para normal, 'top' para zoom) */
  revealDirection?: RevealDirection;

  /** Porcentagem do tempo do elemento em que a animação completa (padrão: 60) */
  revealPercentage?: RevealPercentage;

  /** Modo de exibição do elemento (padrão: 'normal') */
  displayMode?: ElementDisplayMode;

  /** Ativa o modo de desenho estilo VideoScribe (linhas sendo desenhadas progressivamente) */
  drawingMode?: boolean;
}

/**
 * Layout do grid usado para organizar elementos na imagem
 */
export interface GridLayout {
  /** Número de colunas */
  cols: number;
  /** Número de linhas */
  rows: number;
}

/**
 * Posição esperada de um elemento no grid
 */
export interface ElementGridPosition {
  /** Índice do elemento (1-based) */
  elementIndex: number;
  /** Coluna no grid (0-based) */
  gridCol: number;
  /** Linha no grid (0-based) */
  gridRow: number;
  /** Posição X esperada (percentual 0-100) */
  expectedXPercent: number;
  /** Posição Y esperada (percentual 0-100) */
  expectedYPercent: number;
  /** Largura esperada (percentual 0-100) */
  expectedWidthPercent: number;
  /** Altura esperada (percentual 0-100) */
  expectedHeightPercent: number;
}

/**
 * Representa um bloco de imagem gerado a partir do SRT.
 * Cada bloco agrupa várias legendas (20-60 segundos) e corresponde a uma imagem.
 */
export interface ImageBlock {
  /** Identificador único do bloco */
  id: string;

  /** Índice do bloco (0-based, determina ordem) */
  index: number;

  /** Prompt gerado para criação da imagem */
  prompt: string;

  /** Tempo de início do bloco em milissegundos */
  startTime: number;

  /** Tempo de fim do bloco em milissegundos */
  endTime: number;

  /** Frame de início (calculado) */
  startFrame: number;

  /** Frame de fim (calculado) */
  endFrame: number;

  /** Dados da imagem após upload */
  image?: {
    /** URL da imagem (base64 ou path) */
    url: string;
    /** Largura original da imagem em pixels */
    width: number;
    /** Altura original da imagem em pixels */
    height: number;
  };

  /** Elementos da timeline a serem revelados neste bloco */
  timeline: TimelineElement[];

  /** Status de detecção de elementos via Vision API */
  detectionStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'manual';

  /** Mensagem de erro caso a detecção falhe */
  detectionError?: string;

  /** Se true, força modo manual para detecção deste bloco (ignora Vision API) */
  manualDetectionMode?: boolean;

  /** Layout do grid usado para organizar elementos na imagem */
  gridLayout?: GridLayout;

  /** Posições esperadas dos elementos no grid (usado para sincronizar geração e detecção) */
  elementPositions?: ElementGridPosition[];
}

/**
 * Configuração para agrupamento de segmentos em ImageBlocks
 */
export interface ImageBlockConfig {
  /** Duração mínima de um bloco em milissegundos (padrão: 30000 = 30s) */
  minDuration: number;
  /** Duração máxima de um bloco em milissegundos (padrão: 60000 = 60s) */
  maxDuration: number;
  /** Se deve preferir quebrar em mudanças de tópico */
  preferTopicBoundaries: boolean;
}

export const DEFAULT_IMAGE_BLOCK_CONFIG: ImageBlockConfig = {
  minDuration: 30000,
  maxDuration: 60000,
  preferTopicBoundaries: true,
};

/**
 * Calcula a duração da revelação de um elemento
 * Usa o revealPercentage do elemento ou 60% como padrão
 */
export function calculateRevealDuration(element: TimelineElement): number {
  const duration = element.endTime - element.startTime;
  const percentage = element.revealPercentage ?? 60;
  return duration * (percentage / 100);
}

/**
 * Calcula o tempo em que o elemento estará 100% visível
 */
export function calculateRevealEndTime(element: TimelineElement): number {
  return element.startTime + calculateRevealDuration(element);
}

/**
 * Detecta automaticamente a direção de reveal baseado na posição do elemento
 * @param region - Região do elemento
 * @param imageWidth - Largura da imagem
 * @param imageHeight - Altura da imagem
 */
export function detectRevealDirection(
  region: ElementRegion,
  imageWidth: number,
  imageHeight: number
): Exclude<RevealDirection, 'auto'> {
  // Calcula o centro do elemento
  const centerX = region.x + region.width / 2;
  const centerY = region.y + region.height / 2;

  // Calcula as distâncias às bordas
  const distanceLeft = centerX;
  const distanceRight = imageWidth - centerX;
  const distanceTop = centerY;
  const distanceBottom = imageHeight - centerY;

  // Encontra a menor distância
  const minDistance = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);

  // Retorna a direção correspondente à borda mais próxima
  if (minDistance === distanceLeft) return 'left';
  if (minDistance === distanceRight) return 'right';
  if (minDistance === distanceTop) return 'top';
  if (minDistance === distanceBottom) return 'bottom';

  return 'center'; // fallback
}
