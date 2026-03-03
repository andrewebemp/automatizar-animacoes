import React, { useMemo } from 'react';
import { Player } from '@remotion/player';
import { VideoCompositionNew } from '../video/VideoCompositionNew';
import type { ImageScene } from '../../types/ImageScene';
import type { Subtitle } from '../../types/Subtitle';
import type { ProjectNew } from '../../types/ProjectNew';

interface SegmentPreviewProps {
  /** Cena atual */
  scene: ImageScene;
  /** Índice do segmento a ser exibido */
  segmentIndex: number;
  /** Lista completa de legendas */
  subtitles: Subtitle[];
  /** FPS do vídeo */
  fps: number;
  /** Largura do vídeo */
  videoWidth?: number;
  /** Altura do vídeo */
  videoHeight?: number;
}

/**
 * Componente de preview para um único segmento.
 * Mostra como a animação (zoom, reveal) vai aparecer no vídeo final.
 */
export const SegmentPreview: React.FC<SegmentPreviewProps> = ({
  scene,
  segmentIndex,
  subtitles,
  fps,
  videoWidth = 1920,
  videoHeight = 1080,
}) => {
  const segment = scene.segments[segmentIndex];
  const subtitle = segment ? subtitles[segment.subtitleIndex] : null;

  // Cria um mini-projeto apenas com a cena e segmento atual
  const miniProject = useMemo<ProjectNew | null>(() => {
    if (!segment || !subtitle) return null;

    // Cria uma cópia do segmento com subtitleIndex ajustado para 0
    // (já que o array de legendas do preview terá apenas uma legenda)
    const adjustedSegment = {
      ...segment,
      subtitleIndex: 0,
    };

    // Cria uma cópia da cena com apenas o segmento ajustado
    const previewScene: ImageScene = {
      ...scene,
      segments: [adjustedSegment],
    };

    // Cria legendas ajustadas começando do frame 0
    const adjustedSubtitle: Subtitle = {
      ...subtitle,
      startFrame: 0,
      endFrame: subtitle.endFrame - subtitle.startFrame,
    };

    return {
      id: `preview-${segment.id}`,
      name: 'Preview',
      subtitles: [adjustedSubtitle],
      scenes: [previewScene],
      videoConfig: {
        width: videoWidth,
        height: videoHeight,
        fps,
      },
      backgroundColor: '#000000',
      showSubtitles: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [scene, segment, subtitle, fps, videoWidth, videoHeight]);

  // Calcula duração do preview em frames
  const durationInFrames = useMemo(() => {
    if (!subtitle) return fps * 3; // 3 segundos padrão
    return Math.max(subtitle.endFrame - subtitle.startFrame, fps); // Mínimo 1 segundo
  }, [subtitle, fps]);

  // Calcula aspect ratio dinâmico
  const aspectRatio = `${videoWidth}/${videoHeight}`;

  // Se não há segmento ou região, não mostra preview
  if (!segment || !segment.region || !miniProject) {
    return (
      <div
        style={{
          width: '100%',
          aspectRatio,
          backgroundColor: '#1a1a2e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          border: '1px dashed #4a4a6e',
        }}
      >
        <span style={{ color: '#666', fontSize: 12 }}>
          Defina uma região para ver o preview
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #4a4a6e',
      }}
    >
      <Player
        component={VideoCompositionNew}
        inputProps={{
          project: miniProject,
        }}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={videoWidth}
        compositionHeight={videoHeight}
        style={{
          width: '100%',
          aspectRatio,
        }}
        loop
        autoPlay
        controls={false}
      />
    </div>
  );
};

export default SegmentPreview;
