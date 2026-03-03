/**
 * ExportComposition - Composição simplificada e segura para exportação de vídeo.
 *
 * Esta composição foi criada para evitar os bugs de "reading 'width'" que ocorrem
 * nas outras composições. Ela tem validação defensiva completa em todos os níveis.
 */
import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Audio,
  Img,
} from 'remotion';

// ============================================================================
// TIPOS SIMPLIFICADOS (inline para evitar dependências problemáticas)
// ============================================================================

interface SafeSubtitle {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
}

interface SafeRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  pathData?: string;
}

interface SafeSegment {
  id: string;
  subtitleIndex: number;
  region: SafeRegion | null;
  revealDirection: 'left' | 'right' | 'top' | 'bottom' | 'center';
  revealFraction: number;
}

interface SafeScene {
  id: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  segments: SafeSegment[];
}

interface SafeProject {
  scenes: SafeScene[];
  subtitles: SafeSubtitle[];
  backgroundColor: string;
  showSubtitles: boolean;
  audioUrl?: string;
}

interface ExportCompositionProps {
  project: SafeProject;
}

// ============================================================================
// FUNÇÕES DE VALIDAÇÃO
// ============================================================================

function validateProject(input: unknown): SafeProject {
  const raw = input as Record<string, unknown> | null | undefined;

  if (!raw) {
    console.warn('[ExportComposition] Projeto nulo, usando fallback');
    return {
      scenes: [],
      subtitles: [],
      backgroundColor: '#FFFFFF',
      showSubtitles: false,
    };
  }

  const scenes: SafeScene[] = [];
  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];

  for (const rawScene of rawScenes) {
    const scene = rawScene as Record<string, unknown> | null;
    if (!scene) continue;

    const segments: SafeSegment[] = [];
    const rawSegments = Array.isArray(scene.segments) ? scene.segments : [];

    for (const rawSegment of rawSegments) {
      const seg = rawSegment as Record<string, unknown> | null;
      if (!seg) continue;

      let region: SafeRegion | null = null;
      const rawRegion = seg.region as Record<string, unknown> | null;

      if (rawRegion) {
        region = {
          x: typeof rawRegion.x === 'number' ? rawRegion.x : 0,
          y: typeof rawRegion.y === 'number' ? rawRegion.y : 0,
          width: typeof rawRegion.width === 'number' && rawRegion.width > 0 ? rawRegion.width : 100,
          height: typeof rawRegion.height === 'number' && rawRegion.height > 0 ? rawRegion.height : 100,
          pathData: typeof rawRegion.pathData === 'string' ? rawRegion.pathData : undefined,
        };
      }

      segments.push({
        id: typeof seg.id === 'string' ? seg.id : `seg-${Math.random().toString(36).slice(2)}`,
        subtitleIndex: typeof seg.subtitleIndex === 'number' ? seg.subtitleIndex : 0,
        region,
        revealDirection: ['left', 'right', 'top', 'bottom', 'center'].includes(seg.revealDirection as string)
          ? (seg.revealDirection as SafeSegment['revealDirection'])
          : 'left',
        revealFraction: typeof seg.revealFraction === 'number' ? seg.revealFraction : 0.6,
      });
    }

    scenes.push({
      id: typeof scene.id === 'string' ? scene.id : `scene-${Math.random().toString(36).slice(2)}`,
      imageUrl: typeof scene.imageUrl === 'string' ? scene.imageUrl : '',
      imageWidth: typeof scene.imageWidth === 'number' && scene.imageWidth > 0 ? scene.imageWidth : 1920,
      imageHeight: typeof scene.imageHeight === 'number' && scene.imageHeight > 0 ? scene.imageHeight : 1080,
      segments,
    });
  }

  const subtitles: SafeSubtitle[] = [];
  const rawSubtitles = Array.isArray(raw.subtitles) ? raw.subtitles : [];

  for (const rawSub of rawSubtitles) {
    const sub = rawSub as Record<string, unknown> | null;
    if (!sub) continue;

    subtitles.push({
      id: typeof sub.id === 'string' ? sub.id : `sub-${Math.random().toString(36).slice(2)}`,
      text: typeof sub.text === 'string' ? sub.text : '',
      startFrame: typeof sub.startFrame === 'number' ? sub.startFrame : 0,
      endFrame: typeof sub.endFrame === 'number' ? sub.endFrame : 30,
    });
  }

  return {
    scenes,
    subtitles,
    backgroundColor: typeof raw.backgroundColor === 'string' ? raw.backgroundColor : '#FFFFFF',
    showSubtitles: typeof raw.showSubtitles === 'boolean' ? raw.showSubtitles : false,
    audioUrl: typeof raw.audioUrl === 'string' && raw.audioUrl.length > 0 ? raw.audioUrl : undefined,
  };
}

// ============================================================================
// COMPONENTES INTERNOS
// ============================================================================

interface SceneState {
  scene: SafeScene;
  isActive: boolean;
  opacity: number;
}

interface SegmentState {
  segment: SafeSegment;
  subtitle: SafeSubtitle;
  progress: number;
}

const SafeSceneRenderer: React.FC<{
  scene: SafeScene;
  subtitles: SafeSubtitle[];
  frame: number;
  videoWidth: number;
  videoHeight: number;
  backgroundColor: string;
  showSubtitles: boolean;
  opacity: number;
}> = ({
  scene,
  subtitles,
  frame,
  videoWidth,
  videoHeight,
  backgroundColor,
  showSubtitles,
  opacity,
}) => {
  // Dimensões seguras
  const imgW = scene.imageWidth > 0 ? scene.imageWidth : 1920;
  const imgH = scene.imageHeight > 0 ? scene.imageHeight : 1080;

  // Calcula escala para fit
  const scaleX = videoWidth / imgW;
  const scaleY = videoHeight / imgH;
  const scale = Math.min(scaleX, scaleY);
  const scaledW = imgW * scale;
  const scaledH = imgH * scale;
  const offsetX = (videoWidth - scaledW) / 2;
  const offsetY = (videoHeight - scaledH) / 2;

  // Calcula estado dos segmentos
  const segmentStates = useMemo((): SegmentState[] => {
    return scene.segments
      .map((segment) => {
        const subtitle = subtitles[segment.subtitleIndex];
        if (!subtitle) return null;

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

        return { segment, subtitle, progress };
      })
      .filter((s): s is SegmentState => s !== null);
  }, [scene.segments, subtitles, frame]);

  // Encontra legenda atual
  const currentSubtitle = useMemo(() => {
    if (!showSubtitles) return '';
    const active = segmentStates.find(
      (s) => frame >= s.subtitle.startFrame && frame < s.subtitle.endFrame
    );
    return active?.subtitle.text || '';
  }, [segmentStates, frame, showSubtitles]);

  const maskId = `export-mask-${scene.id}`;

  return (
    <AbsoluteFill style={{ backgroundColor, opacity }}>
      <svg
        width={videoWidth}
        height={videoHeight}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <defs>
          <mask id={maskId}>
            <rect width={videoWidth} height={videoHeight} fill="black" />
            <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
              {segmentStates.map((state, index) => {
                if (!state.segment.region || state.progress <= 0) return null;
                const region = state.segment.region;

                // Calcula clip baseado na direção
                const getClipRect = () => {
                  const { x, y, width, height } = region;
                  const p = state.progress;
                  const dir = state.segment.revealDirection;

                  switch (dir) {
                    case 'left':
                      return { x, y, width: width * p, height };
                    case 'right':
                      return { x: x + width * (1 - p), y, width: width * p, height };
                    case 'top':
                      return { x, y, width, height: height * p };
                    case 'bottom':
                      return { x, y: y + height * (1 - p), width, height: height * p };
                    case 'center':
                    default:
                      const cw = width * p;
                      const ch = height * p;
                      return {
                        x: x + (width - cw) / 2,
                        y: y + (height - ch) / 2,
                        width: cw,
                        height: ch,
                      };
                  }
                };

                const clip = getClipRect();
                const clipId = `clip-${state.segment.id}-${index}`;

                // Se tem pathData, usa o path; senão usa rect
                if (region.pathData) {
                  return (
                    <g key={state.segment.id}>
                      <defs>
                        <clipPath id={clipId}>
                          <rect x={clip.x} y={clip.y} width={clip.width} height={clip.height} />
                        </clipPath>
                      </defs>
                      <path
                        d={region.pathData}
                        fill="white"
                        clipPath={`url(#${clipId})`}
                      />
                    </g>
                  );
                }

                return (
                  <rect
                    key={state.segment.id}
                    x={clip.x}
                    y={clip.y}
                    width={clip.width}
                    height={clip.height}
                    fill="white"
                  />
                );
              })}
            </g>
          </mask>
        </defs>

        {scene.imageUrl && (
          <image
            href={scene.imageUrl}
            x={offsetX}
            y={offsetY}
            width={scaledW}
            height={scaledH}
            mask={`url(#${maskId})`}
            preserveAspectRatio="none"
          />
        )}
      </svg>

      {/* Legenda */}
      {showSubtitles && currentSubtitle && (
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
            {currentSubtitle}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ============================================================================
// COMPOSIÇÃO PRINCIPAL
// ============================================================================

export const ExportComposition: React.FC<ExportCompositionProps> = ({ project: rawProject }) => {
  const frame = useCurrentFrame();
  const { width: videoWidth, height: videoHeight, fps } = useVideoConfig();

  // Valida o projeto com fallbacks seguros
  const project = useMemo(() => validateProject(rawProject), [rawProject]);

  console.log('[ExportComposition] Projeto validado:', {
    scenes: project.scenes.length,
    subtitles: project.subtitles.length,
    frame,
  });

  // Se não há cenas, mostra tela vazia
  if (project.scenes.length === 0) {
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

  // Duração do crossfade em frames
  const crossfadeDuration = Math.round(fps * 0.5);

  // Encontra a cena atual
  const currentSceneInfo = useMemo(() => {
    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i];
      const nextScene = project.scenes[i + 1];

      if (scene.segments.length === 0) continue;

      // Encontra primeiro e último frame da cena
      let sceneStart = Infinity;
      let sceneEnd = 0;

      for (const seg of scene.segments) {
        const sub = project.subtitles[seg.subtitleIndex];
        if (sub) {
          sceneStart = Math.min(sceneStart, sub.startFrame);
          sceneEnd = Math.max(sceneEnd, sub.endFrame);
        }
      }

      if (sceneStart === Infinity) continue;

      // Verifica se estamos nesta cena
      if (frame >= sceneStart && frame < sceneEnd) {
        let opacity = 1;
        let nextSceneToRender: SafeScene | null = null;
        let nextOpacity = 0;

        // Verifica transição para próxima cena
        if (nextScene && nextScene.segments.length > 0) {
          const nextFirstSub = project.subtitles[nextScene.segments[0].subtitleIndex];
          if (nextFirstSub) {
            const transitionStart = nextFirstSub.startFrame - crossfadeDuration;
            if (frame >= transitionStart && frame < nextFirstSub.startFrame) {
              opacity = interpolate(
                frame,
                [transitionStart, nextFirstSub.startFrame],
                [1, 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
              );
              nextSceneToRender = nextScene;
              nextOpacity = 1 - opacity;
            }
          }
        }

        return { scene, opacity, nextScene: nextSceneToRender, nextOpacity };
      }
    }

    // Fallback: última cena
    return {
      scene: project.scenes[project.scenes.length - 1],
      opacity: 1,
      nextScene: null,
      nextOpacity: 0,
    };
  }, [frame, project.scenes, project.subtitles, crossfadeDuration]);

  return (
    <AbsoluteFill style={{ backgroundColor: project.backgroundColor }}>
      {/* Áudio */}
      {project.audioUrl && <Audio src={project.audioUrl} />}

      {/* Cena atual */}
      <SafeSceneRenderer
        scene={currentSceneInfo.scene}
        subtitles={project.subtitles}
        frame={frame}
        videoWidth={videoWidth}
        videoHeight={videoHeight}
        backgroundColor={project.backgroundColor}
        showSubtitles={project.showSubtitles}
        opacity={currentSceneInfo.opacity}
      />

      {/* Próxima cena (transição) */}
      {currentSceneInfo.nextScene && currentSceneInfo.nextOpacity > 0 && (
        <SafeSceneRenderer
          scene={currentSceneInfo.nextScene}
          subtitles={project.subtitles}
          frame={frame}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          backgroundColor={project.backgroundColor}
          showSubtitles={project.showSubtitles}
          opacity={currentSceneInfo.nextOpacity}
        />
      )}
    </AbsoluteFill>
  );
};

export default ExportComposition;
