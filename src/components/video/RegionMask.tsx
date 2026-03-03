import React, { useMemo } from 'react';
import type { RegionBounds } from '../../types/Region';
import type { RevealDirection } from '../../types/VideoSegment';

interface RegionMaskProps {
  /** SVG path data da região */
  pathData: string;

  /** Progresso do reveal (0 a 1) */
  progress: number;

  /** Direção do reveal */
  direction: RevealDirection;

  /** Bounding box da região */
  bounds: RegionBounds;

  /** ID único para o clipPath */
  clipId: string;

  /** Largura da imagem (para cálculo de 'auto' direction) */
  imageWidth?: number;

  /** Altura da imagem (para cálculo de 'auto' direction) */
  imageHeight?: number;
}

/**
 * Calcula a direção automática baseada na posição do elemento na imagem.
 * A direção é escolhida para "revelar" de fora para dentro da imagem.
 */
function getAutoDirection(bounds: RegionBounds, imageWidth: number = 1920, imageHeight: number = 1080): Exclude<RevealDirection, 'auto'> {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  // Calcula a posição relativa do centro do elemento (0-1)
  const relX = centerX / imageWidth;
  const relY = centerY / imageHeight;

  // Calcula distância do centro
  const distFromCenterX = Math.abs(relX - 0.5);
  const distFromCenterY = Math.abs(relY - 0.5);

  // Se o elemento está próximo do centro, usa reveal do centro
  if (distFromCenterX < 0.15 && distFromCenterY < 0.15) {
    return 'center';
  }

  // Caso contrário, escolhe a direção baseado na posição
  if (distFromCenterX > distFromCenterY) {
    // Mais deslocado horizontalmente
    return relX < 0.5 ? 'left' : 'right';
  } else {
    // Mais deslocado verticalmente
    return relY < 0.5 ? 'top' : 'bottom';
  }
}

/**
 * Calcula o retângulo de clip baseado na direção e progresso do reveal.
 */
function getRevealClipRect(
  bounds: RegionBounds,
  progress: number,
  direction: RevealDirection,
  imageWidth: number = 1920,
  imageHeight: number = 1080
): { x: number; y: number; width: number; height: number } {
  const { x, y, width, height } = bounds;

  // Adiciona margem para garantir que o clip cubra completamente
  const margin = 2;

  // Resolve 'auto' para uma direção concreta
  const effectiveDirection = direction === 'auto'
    ? getAutoDirection(bounds, imageWidth, imageHeight)
    : direction;

  switch (effectiveDirection) {
    case 'left':
      // Revela da esquerda para a direita
      return {
        x: x - margin,
        y: y - margin,
        width: width * progress + margin * 2,
        height: height + margin * 2,
      };

    case 'right':
      // Revela da direita para a esquerda
      const rightX = x + width * (1 - progress);
      return {
        x: rightX - margin,
        y: y - margin,
        width: width * progress + margin * 2,
        height: height + margin * 2,
      };

    case 'top':
      // Revela de cima para baixo
      return {
        x: x - margin,
        y: y - margin,
        width: width + margin * 2,
        height: height * progress + margin * 2,
      };

    case 'bottom':
      // Revela de baixo para cima
      const bottomY = y + height * (1 - progress);
      return {
        x: x - margin,
        y: bottomY - margin,
        width: width + margin * 2,
        height: height * progress + margin * 2,
      };

    case 'center':
    default:
      // Revela do centro para fora
      const centerProgress = progress;
      const clipWidth = width * centerProgress;
      const clipHeight = height * centerProgress;
      return {
        x: x + (width - clipWidth) / 2 - margin,
        y: y + (height - clipHeight) / 2 - margin,
        width: clipWidth + margin * 2,
        height: clipHeight + margin * 2,
      };
  }
}

/**
 * Renderiza uma máscara SVG para uma região com animação de reveal.
 * O pathData é renderizado diretamente - sem conversões que possam perder a forma.
 */
export const RegionMask: React.FC<RegionMaskProps> = ({
  pathData,
  progress,
  direction,
  bounds,
  clipId,
  imageWidth = 1920,
  imageHeight = 1080,
}) => {
  const clipRect = useMemo(
    () => getRevealClipRect(bounds, progress, direction, imageWidth, imageHeight),
    [bounds, progress, direction, imageWidth, imageHeight]
  );

  // Se progresso completo, renderiza o path sem clip
  if (progress >= 1) {
    return <path d={pathData} fill="white" />;
  }

  // Se progresso zero, não renderiza nada
  if (progress <= 0) {
    return null;
  }

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect
            x={clipRect.x}
            y={clipRect.y}
            width={clipRect.width}
            height={clipRect.height}
          />
        </clipPath>
      </defs>
      <path d={pathData} fill="white" clipPath={`url(#${clipId})`} />
    </g>
  );
};

export default RegionMask;
