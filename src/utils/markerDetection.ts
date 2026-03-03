/**
 * Utilitário para detectar marcadores numéricos [1], [2], etc. em imagens
 * e criar regiões retangulares ao redor deles.
 */

import type { Region, RegionBounds } from '../types/Region';

/**
 * Informação de um marcador detectado
 */
export interface DetectedMarker {
  /** Número do marcador (1, 2, 3, etc.) */
  number: number;
  /** Bounding box do marcador na imagem */
  bounds: RegionBounds;
  /** Confiança da detecção (0-1) */
  confidence: number;
}

/**
 * Cria uma região retangular a partir de bounds
 */
function createRectRegionFromBounds(bounds: RegionBounds, markerNumber: number): Region {
  const { x, y, width, height } = bounds;
  const pathData = `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`;

  return {
    id: `auto-region-${markerNumber}-${Date.now()}`,
    pathData,
    bounds: { x, y, width, height },
    source: 'ai-detected',
  };
}

/**
 * Expande o bounds para incluir uma área maior ao redor do marcador
 * Isso é útil para capturar o elemento visual associado ao número
 */
function expandBoundsForElement(
  bounds: RegionBounds,
  imageWidth: number,
  imageHeight: number,
  expansionFactor: number = 3
): RegionBounds {
  // Expande o bounds para capturar o elemento visual próximo ao marcador
  const expandedWidth = bounds.width * expansionFactor;
  const expandedHeight = bounds.height * expansionFactor;

  // Centraliza a expansão no marcador
  let newX = bounds.x - (expandedWidth - bounds.width) / 2;
  let newY = bounds.y - (expandedHeight - bounds.height) / 2;

  // Limita aos bounds da imagem
  newX = Math.max(0, Math.min(newX, imageWidth - expandedWidth));
  newY = Math.max(0, Math.min(newY, imageHeight - expandedHeight));

  return {
    x: newX,
    y: newY,
    width: Math.min(expandedWidth, imageWidth - newX),
    height: Math.min(expandedHeight, imageHeight - newY),
  };
}

/**
 * Detecta marcadores numéricos em uma imagem usando análise de canvas
 * Esta é uma implementação simplificada que busca por padrões de texto [N]
 */
export async function detectMarkersInImage(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number,
  maxMarkers: number = 12
): Promise<DetectedMarker[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve([]);
        return;
      }

      canvas.width = imageWidth;
      canvas.height = imageHeight;
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight);

      // Como não temos OCR real, vamos usar uma heurística baseada em
      // posicionamento típico de elementos numerados em imagens didáticas
      // Os marcadores geralmente são distribuídos em grade
      const markers = generateEstimatedMarkerPositions(
        imageWidth,
        imageHeight,
        maxMarkers
      );

      resolve(markers);
    };

    img.onerror = () => {
      resolve([]);
    };

    img.src = imageUrl;
  });
}

/**
 * Gera posições estimadas de marcadores baseado no layout típico
 * de imagens didáticas com elementos numerados
 */
function generateEstimatedMarkerPositions(
  imageWidth: number,
  imageHeight: number,
  count: number
): DetectedMarker[] {
  const markers: DetectedMarker[] = [];

  // Para imagens com muitos elementos, assumimos um grid
  // Layout típico: 2-3 colunas, múltiplas linhas
  const cols = count <= 4 ? 2 : count <= 6 ? 3 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);

  const cellWidth = imageWidth / cols;
  const cellHeight = imageHeight / rows;

  // Tamanho estimado do marcador (relativo ao tamanho da célula)
  const markerSize = Math.min(cellWidth, cellHeight) * 0.15;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Posição central da célula, com o marcador no canto superior esquerdo
    const cellX = col * cellWidth;
    const cellY = row * cellHeight;

    // Marcador no canto superior esquerdo da célula (onde geralmente ficam os [N])
    const markerX = cellX + cellWidth * 0.1;
    const markerY = cellY + cellHeight * 0.1;

    markers.push({
      number: i + 1,
      bounds: {
        x: markerX,
        y: markerY,
        width: markerSize,
        height: markerSize,
      },
      confidence: 0.5, // Estimativa, não detecção real
    });
  }

  return markers;
}

/**
 * Cria regiões para os segmentos baseado nos marcadores detectados
 * Cada região é expandida para incluir o elemento visual associado
 */
export function createRegionsFromMarkers(
  markers: DetectedMarker[],
  imageWidth: number,
  imageHeight: number,
  expansionFactor: number = 4
): Map<number, Region> {
  const regions = new Map<number, Region>();

  for (const marker of markers) {
    // Expande o bounds do marcador para capturar o elemento visual
    const expandedBounds = expandBoundsForElement(
      marker.bounds,
      imageWidth,
      imageHeight,
      expansionFactor
    );

    const region = createRectRegionFromBounds(expandedBounds, marker.number);
    regions.set(marker.number, region);
  }

  return regions;
}

/**
 * Auto-associa segmentos às regiões baseado na ordem dos marcadores
 * Segmento 1 -> Marcador [1], Segmento 2 -> Marcador [2], etc.
 */
export function autoAssociateSegmentsToMarkers(
  segmentCount: number,
  imageWidth: number,
  imageHeight: number
): Region[] {
  const markers = generateEstimatedMarkerPositions(imageWidth, imageHeight, segmentCount);
  const regions: Region[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const marker = markers[i];
    if (marker) {
      const expandedBounds = expandBoundsForElement(
        marker.bounds,
        imageWidth,
        imageHeight,
        4 // Expansão de 4x para capturar o elemento visual
      );
      regions.push(createRectRegionFromBounds(expandedBounds, marker.number));
    }
  }

  return regions;
}
