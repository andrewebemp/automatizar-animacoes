import React from 'react';
import { AbsoluteFill, Img, useVideoConfig } from 'remotion';
import type { Scene, Element } from '../../types';
import { calculateZoomTransform } from '../../utils/calculateTransform';
import { RevealOverlay } from './RevealOverlay';
import { SubtitleOverlay } from './SubtitleOverlay';

interface SceneRendererProps {
  scene: Scene;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  revealedElements: Element[];
  currentElementIndex: number;
  revealProgress: number;
  currentSubtitleText: string;
  backgroundColor: string;
}

/**
 * Renderiza uma cena com zoom e reveal progressivo dos elementos.
 * Suporta tanto recorte da imagem principal quanto imagem própria da cena.
 */
export const SceneRenderer: React.FC<SceneRendererProps> = ({
  scene,
  imageUrl,
  imageWidth,
  imageHeight,
  revealedElements,
  currentElementIndex,
  revealProgress,
  currentSubtitleText,
  backgroundColor,
}) => {
  const { width: videoWidth, height: videoHeight } = useVideoConfig();

  // Valores seguros para as props recebidas
  const safeImageWidth = imageWidth > 0 ? imageWidth : 1920;
  const safeImageHeight = imageHeight > 0 ? imageHeight : 1080;

  // Verifica se a cena tem imagem própria com dimensões válidas
  const hasOwnImage = !!scene.imageUrl &&
    !!scene.imageDimensions &&
    typeof scene.imageDimensions.width === 'number' &&
    scene.imageDimensions.width > 0;

  // Se a cena tem imagem própria, usa ela; senão usa a imagem principal
  const effectiveImageUrl = hasOwnImage ? scene.imageUrl! : imageUrl;
  const effectiveImageWidth = hasOwnImage
    ? (scene.imageDimensions?.width || safeImageWidth)
    : safeImageWidth;
  const effectiveImageHeight = hasOwnImage
    ? (scene.imageDimensions?.height || safeImageHeight)
    : safeImageHeight;

  // Para cena com imagem própria, a cena ocupa toda a imagem (x=0, y=0, w=1, h=1)
  const effectiveScene: Scene = hasOwnImage
    ? { ...scene, x: 0, y: 0, width: 1, height: 1 }
    : scene;

  // Calcula a transformação de zoom para esta cena
  const transform = calculateZoomTransform(
    effectiveScene,
    videoWidth,
    videoHeight,
    effectiveImageWidth,
    effectiveImageHeight
  );

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Imagem com zoom aplicado */}
      <div
        style={{
          position: 'absolute',
          width: effectiveImageWidth,
          height: effectiveImageHeight,
          transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <Img
          src={effectiveImageUrl}
          style={{
            width: effectiveImageWidth,
            height: effectiveImageHeight,
          }}
        />

        {/* Overlay de reveal progressivo */}
        <RevealOverlay
          scene={scene}
          revealedElements={revealedElements}
          currentElementIndex={currentElementIndex}
          revealProgress={revealProgress}
          backgroundColor={backgroundColor}
          imageWidth={effectiveImageWidth}
          imageHeight={effectiveImageHeight}
        />
      </div>

      {/* Legenda */}
      {currentSubtitleText && (
        <SubtitleOverlay text={currentSubtitleText} />
      )}
    </AbsoluteFill>
  );
};
