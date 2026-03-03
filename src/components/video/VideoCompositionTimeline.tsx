import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Audio,
} from 'remotion';
import type { TimelineProject, TimelineScene, SceneElement } from '../../types/TimelineProject';
import { RegionMask } from './RegionMask';

interface VideoCompositionTimelineProps {
  /** Dados do projeto Timeline */
  project: TimelineProject;
}

/**
 * Composição principal do vídeo para o modo Timeline.
 * Renderiza cenas baseadas em startTime/endTime definidos pelo usuário.
 */
export const VideoCompositionTimeline: React.FC<VideoCompositionTimelineProps> = ({
  project,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Converte frame atual para milissegundos
  const currentTimeMs = (frame / fps) * 1000;

  // Validação defensiva
  if (!project || !project.scenes) {
    console.error('[VideoCompositionTimeline] Projeto inválido:', {
      hasProject: !!project,
      hasScenes: !!project?.scenes,
    });
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#fff',
            fontSize: 24,
          }}
        >
          Erro: Projeto não carregado
        </div>
      </AbsoluteFill>
    );
  }

  // Duração do crossfade em ms (0.3 segundos)
  const crossfadeDurationMs = 300;

  // Encontra a cena atual baseado no tempo
  const currentSceneData = useMemo(() => {
    const { scenes } = project;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const nextScene = scenes[i + 1];

      // Verifica se estamos nesta cena
      if (currentTimeMs >= scene.startTime && currentTimeMs < scene.endTime) {
        // Verifica se estamos em transição para a próxima cena
        let isTransitioning = false;
        let nextSceneData = null;

        if (nextScene) {
          const transitionStart = nextScene.startTime - crossfadeDurationMs;
          if (currentTimeMs >= transitionStart && currentTimeMs < nextScene.startTime) {
            isTransitioning = true;
            nextSceneData = {
              scene: nextScene,
              startTime: nextScene.startTime,
            };
          }
        }

        return {
          scene,
          index: i,
          isTransitioning,
          nextSceneData,
        };
      }
    }

    // Se não encontrou, verifica se estamos antes da primeira ou depois da última
    if (scenes.length > 0) {
      const firstScene = scenes[0];
      const lastScene = scenes[scenes.length - 1];

      if (currentTimeMs < firstScene.startTime) {
        return {
          scene: firstScene,
          index: 0,
          isTransitioning: false,
          nextSceneData: null,
        };
      }

      if (currentTimeMs >= lastScene.endTime) {
        return {
          scene: lastScene,
          index: scenes.length - 1,
          isTransitioning: false,
          nextSceneData: null,
        };
      }
    }

    return null;
  }, [currentTimeMs, project.scenes, crossfadeDurationMs]);

  // Se não há cena, mostra tela de fundo
  if (!currentSceneData || project.scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: project.backgroundColor }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#666',
            fontSize: 24,
          }}
        >
          Nenhuma cena definida
        </div>
      </AbsoluteFill>
    );
  }

  const { scene, isTransitioning, nextSceneData } = currentSceneData;

  // Calcula opacidade para crossfade
  let currentOpacity = 1;
  if (isTransitioning && nextSceneData) {
    const transitionStart = nextSceneData.startTime - crossfadeDurationMs;
    currentOpacity = interpolate(
      currentTimeMs,
      [transitionStart, nextSceneData.startTime],
      [1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  // Encontra a legenda atual baseada no tempo (se showSubtitles estiver ativo)
  const currentSubtitleText = useMemo(() => {
    if (!project.showSubtitles) return '';

    // Procura em todas as cenas por legendas que correspondam ao tempo atual
    for (const s of project.scenes) {
      if (s.subtitles) {
        for (const subtitle of s.subtitles) {
          // Converte tempo da legenda (que está em ms) para comparar com currentTimeMs
          const startMs = subtitle.startTime;
          const endMs = subtitle.endTime;
          if (currentTimeMs >= startMs && currentTimeMs < endMs) {
            return subtitle.text;
          }
        }
      }
    }
    return '';
  }, [project.showSubtitles, project.scenes, currentTimeMs]);

  return (
    <AbsoluteFill style={{ backgroundColor: project.backgroundColor }}>
      {/* Áudio global */}
      {project.audioUrl && (
        <Audio src={project.audioUrl} />
      )}

      {/* Cena atual */}
      <AbsoluteFill style={{ opacity: currentOpacity }}>
        <TimelineSceneRenderer
          scene={scene}
          currentTimeMs={currentTimeMs}
          backgroundColor={project.backgroundColor}
          videoWidth={width}
          videoHeight={height}
        />
      </AbsoluteFill>

      {/* Próxima cena (durante transição) */}
      {isTransitioning && nextSceneData && (
        <AbsoluteFill style={{ opacity: 1 - currentOpacity }}>
          <TimelineSceneRenderer
            scene={nextSceneData.scene}
            currentTimeMs={currentTimeMs}
            backgroundColor={project.backgroundColor}
            videoWidth={width}
            videoHeight={height}
          />
        </AbsoluteFill>
      )}

      {/* Legenda */}
      {project.showSubtitles && currentSubtitleText && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 40px',
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: 8,
              fontSize: Math.max(24, height * 0.035),
              fontWeight: 600,
              textAlign: 'center',
              maxWidth: '80%',
              lineHeight: 1.4,
            }}
          >
            {currentSubtitleText}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/**
 * Renderizador de uma cena individual do modo Timeline.
 */
interface TimelineSceneRendererProps {
  scene: TimelineScene;
  currentTimeMs: number;
  backgroundColor: string;
  videoWidth: number;
  videoHeight: number;
}

const TimelineSceneRenderer: React.FC<TimelineSceneRendererProps> = ({
  scene,
  currentTimeMs,
  backgroundColor,
  videoWidth,
  videoHeight,
}) => {
  // Valores seguros para dimensões da imagem
  const safeImageWidth = (scene.imageWidth && scene.imageWidth > 0) ? scene.imageWidth : 1920;
  const safeImageHeight = (scene.imageHeight && scene.imageHeight > 0) ? scene.imageHeight : 1080;

  // Calcula a escala e offset para centralizar a imagem
  const { scale, offsetX, offsetY } = useMemo(() => {
    const scaleX = videoWidth / safeImageWidth;
    const scaleY = videoHeight / safeImageHeight;
    const scl = Math.min(scaleX, scaleY);

    const scaledWidth = safeImageWidth * scl;
    const scaledHeight = safeImageHeight * scl;

    return {
      scale: scl,
      offsetX: (videoWidth - scaledWidth) / 2,
      offsetY: (videoHeight - scaledHeight) / 2,
    };
  }, [videoWidth, videoHeight, safeImageWidth, safeImageHeight]);

  // Calcula o estado de cada elemento
  const elementStates = useMemo(() => {
    return scene.elements
      .map((element) => {
        // Calcula progresso do reveal
        const elementDuration = element.endTime - element.startTime;
        const revealDuration = elementDuration * element.revealFraction;
        const revealEndTime = element.startTime + revealDuration;

        let progress: number;
        if (currentTimeMs < element.startTime) {
          progress = 0;
        } else if (currentTimeMs >= revealEndTime) {
          progress = 1;
        } else {
          progress = interpolate(
            currentTimeMs,
            [element.startTime, revealEndTime],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
        }

        // Verifica se este elemento está ativo
        const isActive = currentTimeMs >= element.startTime && currentTimeMs < element.endTime;

        return { element, progress, isActive };
      })
      .filter((s) => s.progress > 0 || s.isActive); // Só inclui elementos com progresso ou ativos
  }, [scene.elements, currentTimeMs]);

  // Encontra o elemento atualmente ativo (para modo zoom)
  const activeElementState = useMemo(() => {
    return elementStates.find((s) => s.isActive) || null;
  }, [elementStates]);

  // Verifica se devemos usar modo zoom
  const useZoomMode = useMemo(() => {
    if (!activeElementState) return false;
    return activeElementState.element.displayMode === 'zoom' &&
           activeElementState.element.region !== null;
  }, [activeElementState]);

  // Calcula transformação para modo zoom
  const zoomTransform = useMemo(() => {
    if (!useZoomMode || !activeElementState?.element.region) {
      return null;
    }

    const region = activeElementState.element.region;
    const { bounds } = region;

    // Expande o bounds para criar um recorte 16:9 ao redor da região
    const targetAspect = videoWidth / videoHeight;
    const regionAspect = bounds.width / bounds.height;

    let cropWidth: number;
    let cropHeight: number;

    // Adiciona padding ao redor da região (20% extra)
    const padding = 1.2;

    if (regionAspect > targetAspect) {
      cropWidth = bounds.width * padding;
      cropHeight = cropWidth / targetAspect;
    } else {
      cropHeight = bounds.height * padding;
      cropWidth = cropHeight * targetAspect;
    }

    // Centraliza o crop na região
    const cropX = bounds.x + bounds.width / 2 - cropWidth / 2;
    const cropY = bounds.y + bounds.height / 2 - cropHeight / 2;

    // Limita aos bounds da imagem
    const clampedX = Math.max(0, Math.min(cropX, safeImageWidth - cropWidth));
    const clampedY = Math.max(0, Math.min(cropY, safeImageHeight - cropHeight));
    const clampedWidth = Math.min(cropWidth, safeImageWidth);
    const clampedHeight = Math.min(cropHeight, safeImageHeight);

    // Escala para preencher o vídeo
    const zoomScale = Math.min(videoWidth / clampedWidth, videoHeight / clampedHeight);

    return {
      cropX: clampedX,
      cropY: clampedY,
      cropWidth: clampedWidth,
      cropHeight: clampedHeight,
      scale: zoomScale,
      offsetX: (videoWidth - clampedWidth * zoomScale) / 2,
      offsetY: (videoHeight - clampedHeight * zoomScale) / 2,
    };
  }, [useZoomMode, activeElementState, videoWidth, videoHeight, safeImageWidth, safeImageHeight]);

  // Gera ID único para a máscara
  const maskId = `timeline-scene-mask-${scene.id}`;

  // Renderização para modo zoom
  if (useZoomMode && zoomTransform && activeElementState?.element.region) {
    const region = activeElementState.element.region;
    const { pathData, bounds } = region;
    const zoomMaskId = `zoom-mask-${scene.id}-${activeElementState.element.id}`;

    const zoomPathScale = zoomTransform.scale;
    const zoomPathOffsetX = -zoomTransform.cropX * zoomPathScale + zoomTransform.offsetX;
    const zoomPathOffsetY = -zoomTransform.cropY * zoomPathScale + zoomTransform.offsetY;

    // Escala individual do elemento
    const elementScale = activeElementState.element.scale || 1.0;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    return (
      <AbsoluteFill style={{ backgroundColor }}>
        <AbsoluteFill>
          <svg
            width={videoWidth}
            height={videoHeight}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            <defs>
              <mask id={zoomMaskId}>
                <rect width={videoWidth} height={videoHeight} fill="black" />
                <g transform={`translate(${zoomPathOffsetX}, ${zoomPathOffsetY}) scale(${zoomPathScale})`}>
                  {elementScale !== 1.0 ? (
                    <g transform={`translate(${centerX}, ${centerY}) scale(${elementScale}) translate(${-centerX}, ${-centerY})`}>
                      <RegionMask
                        pathData={pathData}
                        progress={activeElementState.progress}
                        direction={activeElementState.element.revealDirection}
                        bounds={bounds}
                        clipId={`zoom-clip-${activeElementState.element.id}`}
                        imageWidth={safeImageWidth}
                        imageHeight={safeImageHeight}
                      />
                    </g>
                  ) : (
                    <RegionMask
                      pathData={pathData}
                      progress={activeElementState.progress}
                      direction={activeElementState.element.revealDirection}
                      bounds={bounds}
                      clipId={`zoom-clip-${activeElementState.element.id}`}
                      imageWidth={safeImageWidth}
                      imageHeight={safeImageHeight}
                    />
                  )}
                </g>
              </mask>
            </defs>

            {/* Imagem com zoom */}
            <image
              href={scene.imageUrl || ''}
              x={zoomPathOffsetX}
              y={zoomPathOffsetY}
              width={safeImageWidth * zoomPathScale}
              height={safeImageHeight * zoomPathScale}
              mask={`url(#${zoomMaskId})`}
              preserveAspectRatio="none"
            />

            {/* Traços apagados */}
            {scene.erasedStrokes && scene.erasedStrokes.map((stroke) => {
              if (stroke.points.length < 2) return null;

              const strokePath = stroke.points
                .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x * zoomPathScale + zoomPathOffsetX} ${pt.y * zoomPathScale + zoomPathOffsetY}`)
                .join(' ');

              return (
                <path
                  key={stroke.id}
                  d={strokePath}
                  fill="none"
                  stroke={backgroundColor}
                  strokeWidth={stroke.strokeWidth * zoomPathScale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
          </svg>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // Separa elementos com escala normal (1.0) dos elementos com escala diferente
  const normalScaleElements = elementStates.filter(s => (s.element.scale || 1.0) === 1.0);
  const scaledElements = elementStates.filter(s => (s.element.scale || 1.0) !== 1.0);

  // Renderização padrão (modo normal)
  return (
    <AbsoluteFill style={{ backgroundColor }}>
      <AbsoluteFill>
        <svg
          width={videoWidth}
          height={videoHeight}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Elementos com escala normal (1.0) - usam máscara combinada */}
          {normalScaleElements.length > 0 && (
            <>
              <defs>
                <mask id={maskId}>
                  <rect width={videoWidth} height={videoHeight} fill="black" />
                  <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
                    {normalScaleElements.map((state, index) => {
                      if (!state.element.region || state.progress <= 0) return null;

                      const { pathData, bounds } = state.element.region;
                      if (!pathData) return null;

                      return (
                        <RegionMask
                          key={state.element.id}
                          pathData={pathData}
                          progress={state.progress}
                          direction={state.element.revealDirection}
                          bounds={bounds}
                          clipId={`clip-${state.element.id}-${index}`}
                          imageWidth={safeImageWidth}
                          imageHeight={safeImageHeight}
                        />
                      );
                    })}
                  </g>
                </mask>
              </defs>

              {/* Imagem com máscara aplicada para elementos com escala normal */}
              <image
                href={scene.imageUrl || ''}
                x={offsetX}
                y={offsetY}
                width={safeImageWidth * scale}
                height={safeImageHeight * scale}
                mask={`url(#${maskId})`}
                preserveAspectRatio="none"
              />
            </>
          )}

          {/* Elementos com escala diferente de 1.0 - usando SVG aninhado para escalar o resultado */}
          {scaledElements.map((state, idx) => {
            if (!state.element.region || state.progress <= 0) return null;

            const elementScale = state.element.scale || 1.0;
            const { pathData, bounds } = state.element.region;
            if (!pathData) return null;

            const scaledMaskId = `scaled-mask-${scene.id}-${state.element.id}`;

            // Centro do bounds em coordenadas do vídeo (ponto de ancoragem para escala)
            const videoCenterX = (bounds.x + bounds.width / 2) * scale + offsetX;
            const videoCenterY = (bounds.y + bounds.height / 2) * scale + offsetY;

            // Tamanho e posição do SVG aninhado após escala
            // O SVG aninhado contém a imagem+máscara no tamanho original
            // E é posicionado/escalado para o efeito desejado
            const nestedWidth = videoWidth;
            const nestedHeight = videoHeight;

            // Calcula a posição do SVG aninhado para manter o centro da região fixo
            const scaledX = videoCenterX - (videoCenterX * elementScale);
            const scaledY = videoCenterY - (videoCenterY * elementScale);

            return (
              <svg
                key={state.element.id}
                x={scaledX}
                y={scaledY}
                width={nestedWidth * elementScale}
                height={nestedHeight * elementScale}
                viewBox={`0 0 ${nestedWidth} ${nestedHeight}`}
                preserveAspectRatio="none"
                overflow="visible"
              >
                <defs>
                  <mask id={scaledMaskId}>
                    <rect width={nestedWidth} height={nestedHeight} fill="black" />
                    <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
                      <RegionMask
                        pathData={pathData}
                        progress={state.progress}
                        direction={state.element.revealDirection}
                        bounds={bounds}
                        clipId={`scaled-clip-${state.element.id}-${idx}`}
                        imageWidth={safeImageWidth}
                        imageHeight={safeImageHeight}
                      />
                    </g>
                  </mask>
                </defs>
                <image
                  href={scene.imageUrl || ''}
                  x={offsetX}
                  y={offsetY}
                  width={safeImageWidth * scale}
                  height={safeImageHeight * scale}
                  mask={`url(#${scaledMaskId})`}
                  preserveAspectRatio="none"
                />
              </svg>
            );
          })}

          {/* Traços apagados */}
          {scene.erasedStrokes && scene.erasedStrokes.map((stroke) => {
            if (stroke.points.length < 2) return null;

            const strokePath = stroke.points
              .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x * scale + offsetX} ${pt.y * scale + offsetY}`)
              .join(' ');

            return (
              <path
                key={stroke.id}
                d={strokePath}
                fill="none"
                stroke={backgroundColor}
                strokeWidth={stroke.strokeWidth * scale}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default VideoCompositionTimeline;
