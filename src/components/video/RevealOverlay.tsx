import React from 'react';
import { interpolate } from 'remotion';
import type { Scene, Element } from '../../types';

interface RevealOverlayProps {
  scene: Scene;
  revealedElements: Element[];
  currentElementIndex: number;
  revealProgress: number;
  backgroundColor: string;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Converte pontos normalizados (0-1) para string de pontos SVG
 */
function pointsToSvgString(
  points: number[],
  sceneWidth: number,
  sceneHeight: number
): string {
  const result: string[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] * sceneWidth;
    const y = points[i + 1] * sceneHeight;
    result.push(`${x},${y}`);
  }
  return result.join(' ');
}

/**
 * Converte pontos normalizados para path SVG (para freehand)
 */
function pointsToSvgPath(
  points: number[],
  sceneWidth: number,
  sceneHeight: number
): string {
  if (points.length < 4) return '';

  let d = `M ${points[0] * sceneWidth} ${points[1] * sceneHeight}`;

  // Usa curvas quadráticas para suavizar o path
  for (let i = 2; i < points.length - 2; i += 2) {
    const x0 = points[i] * sceneWidth;
    const y0 = points[i + 1] * sceneHeight;
    const x1 = points[i + 2] * sceneWidth;
    const y1 = points[i + 3] * sceneHeight;
    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;
    d += ` Q ${x0} ${y0} ${midX} ${midY}`;
  }

  // Último ponto
  const lastX = points[points.length - 2] * sceneWidth;
  const lastY = points[points.length - 1] * sceneHeight;
  d += ` L ${lastX} ${lastY}`;

  return d;
}

/**
 * Renderiza um elemento SVG de acordo com seu shape
 */
function renderElementShape(
  element: Element,
  sceneWidth: number,
  sceneHeight: number,
  fill: string
): React.ReactNode {
  const elemX = element.x * sceneWidth;
  const elemY = element.y * sceneHeight;
  const elemWidth = element.width * sceneWidth;
  const elemHeight = element.height * sceneHeight;

  switch (element.shape) {
    case 'ellipse':
      return (
        <ellipse
          key={element.id}
          cx={elemX + elemWidth / 2}
          cy={elemY + elemHeight / 2}
          rx={elemWidth / 2}
          ry={elemHeight / 2}
          fill={fill}
        />
      );

    case 'polygon':
      if (element.points && element.points.length >= 6) {
        return (
          <polygon
            key={element.id}
            points={pointsToSvgString(element.points, sceneWidth, sceneHeight)}
            fill={fill}
          />
        );
      }
      // Fallback para rect
      return (
        <rect
          key={element.id}
          x={elemX}
          y={elemY}
          width={elemWidth}
          height={elemHeight}
          fill={fill}
        />
      );

    case 'freehand':
      if (element.points && element.points.length >= 4) {
        // Para freehand, criamos um path fechado preenchendo a área
        const pathD = pointsToSvgPath(element.points, sceneWidth, sceneHeight);
        return (
          <path
            key={element.id}
            d={pathD + ' Z'}
            fill={fill}
            strokeWidth={0}
          />
        );
      }
      // Fallback para rect
      return (
        <rect
          key={element.id}
          x={elemX}
          y={elemY}
          width={elemWidth}
          height={elemHeight}
          fill={fill}
        />
      );

    case 'rect':
    default:
      return (
        <rect
          key={element.id}
          x={elemX}
          y={elemY}
          width={elemWidth}
          height={elemHeight}
          fill={fill}
        />
      );
  }
}

/**
 * Overlay que cobre a cena com a cor de fundo e revela
 * progressivamente os elementos usando SVG mask.
 */
export const RevealOverlay: React.FC<RevealOverlayProps> = ({
  scene,
  revealedElements,
  currentElementIndex,
  revealProgress,
  backgroundColor,
  imageWidth,
  imageHeight,
}) => {
  // Valores seguros
  const safeImageWidth = imageWidth > 0 ? imageWidth : 1920;
  const safeImageHeight = imageHeight > 0 ? imageHeight : 1080;
  const safeSceneX = typeof scene.x === 'number' ? scene.x : 0;
  const safeSceneY = typeof scene.y === 'number' ? scene.y : 0;
  const safeSceneWidth = typeof scene.width === 'number' && scene.width > 0 ? scene.width : 1;
  const safeSceneHeight = typeof scene.height === 'number' && scene.height > 0 ? scene.height : 1;

  // Se a cena tem imagem própria, usa suas dimensões
  const sceneX = scene.imageUrl ? 0 : safeSceneX * safeImageWidth;
  const sceneY = scene.imageUrl ? 0 : safeSceneY * safeImageHeight;
  const sceneWidth = (scene.imageDimensions?.width && scene.imageDimensions.width > 0)
    ? scene.imageDimensions.width
    : safeSceneWidth * safeImageWidth;
  const sceneHeight = (scene.imageDimensions?.height && scene.imageDimensions.height > 0)
    ? scene.imageDimensions.height
    : safeSceneHeight * safeImageHeight;

  // Gera um ID único para o mask
  const maskId = `reveal-mask-${scene.id}`;

  return (
    <svg
      style={{
        position: 'absolute',
        top: sceneY,
        left: sceneX,
        width: sceneWidth,
        height: sceneHeight,
        pointerEvents: 'none',
      }}
      viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
    >
      <defs>
        <mask id={maskId}>
          {/* Fundo branco = tudo visível (será invertido) */}
          <rect width="100%" height="100%" fill="white" />

          {/* Elementos já revelados - buracos pretos */}
          {revealedElements.map((element, index) => {
            // O último elemento revelado tem opacidade progressiva
            const isCurrentElement = index === currentElementIndex;
            const opacity = isCurrentElement
              ? interpolate(revealProgress, [0, 1], [1, 0])
              : 0;

            const fill = `rgba(0, 0, 0, ${1 - opacity})`;

            return renderElementShape(element, sceneWidth, sceneHeight, fill);
          })}
        </mask>
      </defs>

      {/* Retângulo com a cor de fundo, mascarado para revelar elementos */}
      <rect
        width="100%"
        height="100%"
        fill={backgroundColor}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
};
