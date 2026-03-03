import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Sequence,
  Audio,
} from 'remotion';
import type { ProjectNew } from '../../types/ProjectNew';
import { SceneRendererNew } from './SceneRendererNew';

interface VideoCompositionNewProps {
  /** Dados do projeto */
  project: ProjectNew;
}

/**
 * Composição principal do vídeo para o novo fluxo.
 * Gerencia múltiplas cenas com crossfade entre elas.
 */
export const VideoCompositionNew: React.FC<VideoCompositionNewProps> = ({
  project,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Validação defensiva: garante que projeto existe
  if (!project || !project.scenes || !project.subtitles) {
    console.error('[VideoCompositionNew] Projeto inválido:', {
      hasProject: !!project,
      hasScenes: !!project?.scenes,
      hasSubtitles: !!project?.subtitles,
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

  // Duração do crossfade em frames (0.5 segundos)
  const crossfadeDuration = Math.round(fps * 0.5);

  // Encontra a cena atual baseado no frame
  const currentSceneData = useMemo(() => {
    const { scenes, subtitles } = project;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const nextScene = scenes[i + 1];

      // Calcula frames da cena baseado nos segmentos
      if (scene.segments.length === 0) continue;

      const firstSegment = scene.segments[0];
      const lastSegment = scene.segments[scene.segments.length - 1];
      const firstSubtitle = subtitles[firstSegment.subtitleIndex];
      const lastSubtitle = subtitles[lastSegment.subtitleIndex];

      if (!firstSubtitle || !lastSubtitle) continue;

      const sceneStart = firstSubtitle.startFrame;
      const sceneEnd = lastSubtitle.endFrame;

      // Verifica se estamos nesta cena
      if (frame >= sceneStart && frame < sceneEnd) {
        // Verifica se estamos em transição para a próxima cena
        let isTransitioning = false;
        let nextSceneData = null;

        if (nextScene && nextScene.segments.length > 0) {
          const nextFirstSub = subtitles[nextScene.segments[0].subtitleIndex];
          if (nextFirstSub) {
            const transitionStart = nextFirstSub.startFrame - crossfadeDuration;
            if (frame >= transitionStart && frame < nextFirstSub.startFrame) {
              isTransitioning = true;
              nextSceneData = {
                scene: nextScene,
                startFrame: nextFirstSub.startFrame,
              };
            }
          }
        }

        return {
          scene,
          index: i,
          sceneStart,
          sceneEnd,
          isTransitioning,
          nextSceneData,
        };
      }
    }

    // Se não encontrou, verifica se estamos antes da primeira ou depois da última
    if (scenes.length > 0) {
      const firstScene = scenes[0];
      const lastScene = scenes[scenes.length - 1];

      if (firstScene.segments.length > 0) {
        const firstSub = subtitles[firstScene.segments[0].subtitleIndex];
        if (firstSub && frame < firstSub.startFrame) {
          return {
            scene: firstScene,
            index: 0,
            sceneStart: firstSub.startFrame,
            sceneEnd: firstSub.startFrame,
            isTransitioning: false,
            nextSceneData: null,
          };
        }
      }

      if (lastScene.segments.length > 0) {
        const lastSub = subtitles[lastScene.segments[lastScene.segments.length - 1].subtitleIndex];
        if (lastSub) {
          return {
            scene: lastScene,
            index: scenes.length - 1,
            sceneStart: subtitles[lastScene.segments[0].subtitleIndex]?.startFrame ?? 0,
            sceneEnd: lastSub.endFrame,
            isTransitioning: false,
            nextSceneData: null,
          };
        }
      }
    }

    return null;
  }, [frame, project.scenes, project.subtitles, crossfadeDuration]);

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

  const { scene, sceneStart, isTransitioning, nextSceneData } = currentSceneData;

  // Calcula opacidade para crossfade
  let currentOpacity = 1;
  if (isTransitioning && nextSceneData) {
    const transitionStart = nextSceneData.startFrame - crossfadeDuration;
    currentOpacity = interpolate(
      frame,
      [transitionStart, nextSceneData.startFrame],
      [1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: project.backgroundColor }}>
      {/* Áudio global - renderizado apenas uma vez */}
      {project.audioUrl && (
        <Audio src={project.audioUrl} />
      )}

      {/* Cena atual */}
      <AbsoluteFill style={{ opacity: currentOpacity }}>
        <SceneRendererNew
          scene={scene}
          subtitles={project.subtitles}
          backgroundColor={project.backgroundColor}
          videoWidth={width}
          videoHeight={height}
          showSubtitles={project.showSubtitles}
          sceneStartFrame={sceneStart}
        />
      </AbsoluteFill>

      {/* Próxima cena (durante transição) */}
      {isTransitioning && nextSceneData && (
        <AbsoluteFill style={{ opacity: 1 - currentOpacity }}>
          <SceneRendererNew
            scene={nextSceneData.scene}
            subtitles={project.subtitles}
            backgroundColor={project.backgroundColor}
            videoWidth={width}
            videoHeight={height}
            showSubtitles={project.showSubtitles}
            sceneStartFrame={nextSceneData.startFrame}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

export default VideoCompositionNew;
