import type { Scene } from '../types';
import type { AspectRatio } from '../types/VideoConfig';

/**
 * Retorna o valor numérico do aspect ratio.
 */
export function getAspectRatioValue(aspectRatio: AspectRatio): number {
  switch (aspectRatio) {
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '1:1':
      return 1;
  }
}

/**
 * Ajusta as dimensões de uma área para manter o aspect ratio.
 * Mantém a posição central e ajusta largura/altura conforme necessário.
 *
 * @param x - Posição X inicial (0-1)
 * @param y - Posição Y inicial (0-1)
 * @param width - Largura inicial (0-1)
 * @param height - Altura inicial (0-1)
 * @param aspectRatio - Aspect ratio desejado
 * @param imageAspectRatio - Aspect ratio da imagem original
 * @returns Coordenadas ajustadas
 */
export function adjustToAspectRatio(
  x: number,
  y: number,
  width: number,
  height: number,
  aspectRatio: AspectRatio,
  imageAspectRatio: number
): { x: number; y: number; width: number; height: number } {
  const targetRatio = getAspectRatioValue(aspectRatio);

  // Converte para coordenadas absolutas considerando o aspect ratio da imagem
  const currentRatio = (width * imageAspectRatio) / height;

  let newWidth = width;
  let newHeight = height;

  if (currentRatio > targetRatio) {
    // Muito largo - ajustar largura
    newWidth = (height * targetRatio) / imageAspectRatio;
  } else {
    // Muito alto - ajustar altura
    newHeight = (width * imageAspectRatio) / targetRatio;
  }

  // Centraliza a área ajustada
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  const newX = Math.max(0, Math.min(1 - newWidth, centerX - newWidth / 2));
  const newY = Math.max(0, Math.min(1 - newHeight, centerY - newHeight / 2));

  return {
    x: newX,
    y: newY,
    width: Math.min(newWidth, 1 - newX),
    height: Math.min(newHeight, 1 - newY),
  };
}

/**
 * Calcula a transformação CSS necessária para fazer zoom em uma cena.
 *
 * @param scene - Cena alvo
 * @param videoWidth - Largura do vídeo de saída
 * @param videoHeight - Altura do vídeo de saída
 * @param imageWidth - Largura da imagem original
 * @param imageHeight - Altura da imagem original
 * @returns Objeto com scale, translateX e translateY
 */
export function calculateZoomTransform(
  scene: Scene,
  videoWidth: number,
  videoHeight: number,
  imageWidth: number,
  imageHeight: number
): { scale: number; translateX: number; translateY: number } {
  // Calcula a escala necessária para que a cena preencha o vídeo
  const sceneWidthPx = scene.width * imageWidth;
  const sceneHeightPx = scene.height * imageHeight;

  const scaleX = videoWidth / sceneWidthPx;
  const scaleY = videoHeight / sceneHeightPx;
  const scale = Math.min(scaleX, scaleY);

  // Calcula a translação para centralizar a cena
  const scaledImageWidth = imageWidth * scale;
  const scaledImageHeight = imageHeight * scale;

  const sceneStartX = scene.x * imageWidth * scale;
  const sceneStartY = scene.y * imageHeight * scale;

  // Centraliza a cena no viewport
  const sceneCenterX = sceneStartX + (scene.width * imageWidth * scale) / 2;
  const sceneCenterY = sceneStartY + (scene.height * imageHeight * scale) / 2;

  const translateX = videoWidth / 2 - sceneCenterX;
  const translateY = videoHeight / 2 - sceneCenterY;

  return { scale, translateX, translateY };
}

/**
 * Interpola suavemente entre dois valores de transformação.
 *
 * @param from - Transformação de origem
 * @param to - Transformação de destino
 * @param progress - Progresso da interpolação (0-1)
 * @returns Transformação interpolada
 */
export function interpolateTransform(
  from: { scale: number; translateX: number; translateY: number },
  to: { scale: number; translateX: number; translateY: number },
  progress: number
): { scale: number; translateX: number; translateY: number } {
  return {
    scale: from.scale + (to.scale - from.scale) * progress,
    translateX: from.translateX + (to.translateX - from.translateX) * progress,
    translateY: from.translateY + (to.translateY - from.translateY) * progress,
  };
}
