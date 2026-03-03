import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  Audio,
  Img,
} from 'remotion';
import type { ImageScene } from '../../types/ImageScene';
import type { VideoSegment } from '../../types/VideoSegment';
import type { Subtitle } from '../../types/Subtitle';
import { RegionMask } from './RegionMask';

interface SceneRendererNewProps {
  /** Cena a ser renderizada */
  scene: ImageScene;

  /** Legendas do projeto */
  subtitles: Subtitle[];

  /** Cor de fundo */
  backgroundColor: string;

  /** Largura do vídeo */
  videoWidth: number;

  /** Altura do vídeo */
  videoHeight: number;

  /** Mostrar legendas no vídeo */
  showSubtitles: boolean;

  /** URL do áudio (opcional) */
  audioUrl?: string;

  /** Frame de início da cena no vídeo completo */
  sceneStartFrame: number;
}

interface SegmentState {
  segment: VideoSegment;
  subtitle: Subtitle;
  progress: number; // 0 = não iniciado, 0-1 = revelando, 1 = completo
  isActive: boolean; // Se a legenda está sendo exibida agora
}

/**
 * Renderiza uma cena com múltiplos segmentos usando máscara SVG acumulativa.
 * Cada segmento revela uma região da imagem conforme o tempo.
 */
export const SceneRendererNew: React.FC<SceneRendererNewProps> = ({
  scene,
  subtitles,
  backgroundColor,
  videoWidth,
  videoHeight,
  showSubtitles,
  audioUrl,
  sceneStartFrame,
}) => {
  const frame = useCurrentFrame();

  // Valores seguros para dimensões da imagem
  const safeImageWidth = (scene.imageWidth && scene.imageWidth > 0) ? scene.imageWidth : 1920;
  const safeImageHeight = (scene.imageHeight && scene.imageHeight > 0) ? scene.imageHeight : 1080;

  // Log se houve fallback
  if (scene.imageWidth !== safeImageWidth || scene.imageHeight !== safeImageHeight) {
    console.warn('[SceneRendererNew] Usando dimensões fallback:', {
      sceneId: scene.id,
      original: { width: scene.imageWidth, height: scene.imageHeight },
      safe: { width: safeImageWidth, height: safeImageHeight },
    });
  }

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

  // Calcula o estado de cada segmento
  const segmentStates = useMemo((): SegmentState[] => {
    return scene.segments
      .map((segment) => {
        const subtitle = subtitles[segment.subtitleIndex];
        if (!subtitle) return null;

        // Calcula progresso do reveal
        const revealDuration = (subtitle.endFrame - subtitle.startFrame) * segment.revealFraction;
        const revealEndFrame = subtitle.startFrame + revealDuration;

        let progress: number;
        if (frame < subtitle.startFrame) {
          progress = 0;
        } else if (frame >= revealEndFrame) {
          progress = 1;
        } else {
          progress = interpolate(
            frame,
            [subtitle.startFrame, revealEndFrame],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
        }

        // Verifica se este segmento está ativo (legenda sendo exibida)
        const isActive = frame >= subtitle.startFrame && frame < subtitle.endFrame;

        return { segment, subtitle, progress, isActive };
      })
      .filter((s): s is SegmentState => s !== null);
  }, [scene.segments, subtitles, frame]);

  // Encontra o segmento atualmente ativo (para zoom mode)
  const activeSegmentState = useMemo(() => {
    return segmentStates.find((s) => s.isActive) || null;
  }, [segmentStates]);

  // Verifica se devemos usar modo zoom
  // Usa zoom se o segmento ativo tem displayMode: 'zoom' e tem região definida
  const useZoomMode = useMemo(() => {
    if (!activeSegmentState) return false;
    return activeSegmentState.segment.displayMode === 'zoom' &&
           activeSegmentState.segment.region !== null;
  }, [activeSegmentState]);

  // Calcula transformação para modo zoom
  const zoomTransform = useMemo(() => {
    if (!useZoomMode || !activeSegmentState?.segment.region) {
      return null;
    }

    const region = activeSegmentState.segment.region;
    const { bounds } = region;

    // Expande o bounds para criar um recorte 16:9 ao redor da região
    const targetAspect = videoWidth / videoHeight;
    const regionAspect = bounds.width / bounds.height;

    let cropWidth: number;
    let cropHeight: number;

    // Adiciona padding ao redor da região (20% extra)
    const padding = 1.2;

    if (regionAspect > targetAspect) {
      // Região é mais larga que o vídeo
      cropWidth = bounds.width * padding;
      cropHeight = cropWidth / targetAspect;
    } else {
      // Região é mais alta que o vídeo
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
  }, [useZoomMode, activeSegmentState, videoWidth, videoHeight, safeImageWidth, safeImageHeight]);

  // Encontra a legenda atual para exibição
  const currentSubtitleText = useMemo(() => {
    if (!showSubtitles) return '';

    const activeState = segmentStates.find(
      (s) => frame >= s.subtitle.startFrame && frame < s.subtitle.endFrame
    );
    return activeState?.subtitle.text || '';
  }, [segmentStates, frame, showSubtitles]);

  // Gera ID único para a máscara
  const maskId = `scene-mask-${scene.id}`;

  // Renderização para modo zoom
  if (useZoomMode && zoomTransform && activeSegmentState?.segment.region) {
    const region = activeSegmentState.segment.region;
    const { pathData, bounds } = region;
    const zoomMaskId = `zoom-mask-${scene.id}-${activeSegmentState.segment.id}`;

    // Calcula o path escalado para o zoom
    const zoomPathScale = zoomTransform.scale;
    const zoomPathOffsetX = -zoomTransform.cropX * zoomPathScale + zoomTransform.offsetX;
    const zoomPathOffsetY = -zoomTransform.cropY * zoomPathScale + zoomTransform.offsetY;

    return (
      <AbsoluteFill style={{ backgroundColor }}>
        {audioUrl && <Audio src={audioUrl} startFrom={sceneStartFrame} />}

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
                  <RegionMask
                    pathData={pathData}
                    progress={activeSegmentState.progress}
                    direction={activeSegmentState.segment.revealDirection}
                    bounds={bounds}
                    clipId={`zoom-clip-${activeSegmentState.segment.id}`}
                    imageWidth={safeImageWidth}
                    imageHeight={safeImageHeight}
                  />
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

            {/* Traços apagados (pintados com cor de fundo sobre a imagem) */}
            {scene.erasedStrokes && scene.erasedStrokes.map((stroke) => {
              if (stroke.points.length < 2) return null;

              const pathData = stroke.points
                .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x * zoomPathScale + zoomPathOffsetX} ${pt.y * zoomPathScale + zoomPathOffsetY}`)
                .join(' ');

              return (
                <path
                  key={stroke.id}
                  d={pathData}
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

        {/* Legenda */}
        {showSubtitles && currentSubtitleText && (
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
                fontSize: Math.max(24, videoHeight * 0.035),
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
  }

  // Separa elementos por escala/offset (para renderização diferente)
  // Elementos com transformações (scale != 1.0 ou offset) são renderizados separadamente
  const normalScaleStates = segmentStates.filter(s =>
    (s.segment.scale || 1.0) === 1.0 &&
    !s.segment.offsetX &&
    !s.segment.offsetY
  );
  const transformedStates = segmentStates.filter(s =>
    (s.segment.scale || 1.0) !== 1.0 ||
    s.segment.offsetX ||
    s.segment.offsetY
  );

  // Renderização padrão (modo normal)
  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Áudio */}
      {audioUrl && (
        <Audio src={audioUrl} startFrom={sceneStartFrame} />
      )}

      {/* Container da imagem com máscara SVG */}
      <AbsoluteFill style={{ overflow: 'visible' }}>
        <svg
          width={videoWidth}
          height={videoHeight}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        >
          {/* Elementos com escala normal (1.0) - usam máscara combinada */}
          {normalScaleStates.length > 0 && normalScaleStates.some(s => s.segment.region && s.progress > 0) && (
            <>
              <defs>
                {/* Máscara acumulativa - elementos com escala normal (1.0) */}
                <mask id={maskId}>
                  {/* Fundo preto (oculta tudo) */}
                  <rect width={videoWidth} height={videoHeight} fill="black" />

                  {/* Grupo com transformação para escala e offset */}
                  <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
                    {normalScaleStates.map((state, index) => {
                      // Só renderiza se tem região e progresso > 0
                      if (!state.segment.region || state.progress <= 0) return null;

                      const { pathData, bounds } = state.segment.region;
                      if (!pathData) return null;

                      return (
                        <RegionMask
                          key={state.segment.id}
                          pathData={pathData}
                          progress={state.progress}
                          direction={state.segment.revealDirection}
                          bounds={bounds}
                          clipId={`clip-${state.segment.id}-${index}`}
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

          {/* Elementos com transformações (escala != 1.0 ou offset) - usando SVG aninhado */}
          {transformedStates.map((state, idx) => {
            if (!state.segment.region || state.progress <= 0) return null;

            const elementScale = state.segment.scale || 1.0;
            const elementOffsetX = (state.segment.offsetX || 0) * scale; // Converte para escala do vídeo
            const elementOffsetY = (state.segment.offsetY || 0) * scale; // Converte para escala do vídeo
            const { pathData, bounds } = state.segment.region;
            if (!pathData) return null;

            const transformedMaskId = `transformed-mask-${scene.id}-${state.segment.id}`;

            // Centro do bounds em coordenadas do vídeo (ponto de ancoragem para escala)
            const videoCenterX = (bounds.x + bounds.width / 2) * scale + offsetX;
            const videoCenterY = (bounds.y + bounds.height / 2) * scale + offsetY;

            // Tamanho e posição do SVG aninhado após escala
            // O SVG aninhado contém a imagem+máscara no tamanho original
            // E é posicionado/escalado para o efeito desejado
            const nestedWidth = videoWidth;
            const nestedHeight = videoHeight;

            // Calcula a posição do SVG aninhado para manter o centro da região fixo
            // e aplica o offset de posição
            const scaledX = videoCenterX - (videoCenterX * elementScale) + elementOffsetX;
            const scaledY = videoCenterY - (videoCenterY * elementScale) + elementOffsetY;

            return (
              <svg
                key={state.segment.id}
                x={scaledX}
                y={scaledY}
                width={nestedWidth * elementScale}
                height={nestedHeight * elementScale}
                viewBox={`0 0 ${nestedWidth} ${nestedHeight}`}
                preserveAspectRatio="none"
                overflow="visible"
              >
                <defs>
                  <mask id={transformedMaskId}>
                    <rect width={nestedWidth} height={nestedHeight} fill="black" />
                    <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
                      <RegionMask
                        pathData={pathData}
                        progress={state.progress}
                        direction={state.segment.revealDirection}
                        bounds={bounds}
                        clipId={`transformed-clip-${state.segment.id}-${idx}`}
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
                  mask={`url(#${transformedMaskId})`}
                  preserveAspectRatio="none"
                />
              </svg>
            );
          })}

          {/* Traços apagados (pintados com cor de fundo sobre a imagem) */}
          {scene.erasedStrokes && scene.erasedStrokes.map((stroke) => {
            if (stroke.points.length < 2) return null;

            const pathData = stroke.points
              .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x * scale + offsetX} ${pt.y * scale + offsetY}`)
              .join(' ');

            return (
              <path
                key={stroke.id}
                d={pathData}
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

      {/* Legenda */}
      {showSubtitles && currentSubtitleText && (
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
              fontSize: Math.max(24, videoHeight * 0.035),
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

export default SceneRendererNew;
