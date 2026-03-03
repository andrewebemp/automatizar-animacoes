import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Sequence,
} from 'remotion';
import type { ProjectData, Scene, Element, Subtitle } from '../../types';
import { SceneRenderer } from './SceneRenderer';
import { NewFlowVideo } from './NewFlowVideo';

interface ZoomVideoProps {
  projectData: ProjectData;
}

interface SceneTimeline {
  scene: Scene;
  startFrame: number;
  endFrame: number;
  elements: ElementTimeline[];
}

interface ElementTimeline {
  element: Element;
  subtitle: Subtitle;
  startFrame: number;
  endFrame: number;
}

/**
 * Composição principal do vídeo.
 * Gerencia as cenas, elementos e legendas baseado no tempo.
 * Suporta tanto o fluxo legacy (manual) quanto o novo fluxo SRT-first.
 */
export const ZoomVideo: React.FC<ZoomVideoProps> = ({ projectData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Determine which mode we're in BEFORE any conditional hooks
  const imageBlocks = projectData.imageBlocks || [];
  const isNewFlowMode = projectData.mode === 'new-flow' && imageBlocks.length > 0;

  // Legacy flow: extract data (used only in legacy mode, but always extracted)
  // PROTEÇÃO: garante que imageDimensions nunca seja undefined
  const {
    imageUrl,
    imageDimensions: rawImageDimensions,
    scenes,
    subtitles,
    revealStyle,
  } = projectData;

  const imageDimensions = rawImageDimensions || { width: 1920, height: 1080 };

  // Proteção extra para revealStyle
  const safeRevealStyle = revealStyle || {
    backgroundColor: '#FFFFFF',
    crossfadeDuration: 15,
    revealDuration: 10,
  };

  // Constrói a timeline de cenas e elementos
  const sceneTimelines = useMemo(() => {
    const timelines: SceneTimeline[] = [];

    for (const scene of scenes) {
      if (scene.elements.length === 0) continue;

      const elementTimelines: ElementTimeline[] = [];

      for (const element of scene.elements) {
        const subtitle = subtitles[element.subtitleIndex];
        if (!subtitle) continue;

        elementTimelines.push({
          element,
          subtitle,
          startFrame: subtitle.startFrame,
          endFrame: subtitle.endFrame,
        });
      }

      if (elementTimelines.length === 0) continue;

      // Ordena elementos por tempo de início
      elementTimelines.sort((a, b) => a.startFrame - b.startFrame);

      const sceneStart = elementTimelines[0].startFrame;
      const sceneEnd = elementTimelines[elementTimelines.length - 1].endFrame;

      timelines.push({
        scene,
        startFrame: sceneStart,
        endFrame: sceneEnd,
        elements: elementTimelines,
      });
    }

    // Ordena cenas por tempo de início
    timelines.sort((a, b) => a.startFrame - b.startFrame);

    return timelines;
  }, [scenes, subtitles]);

  // Encontra a cena atual baseado no frame
  const currentSceneData = useMemo(() => {
    for (let i = 0; i < sceneTimelines.length; i++) {
      const timeline = sceneTimelines[i];
      const nextTimeline = sceneTimelines[i + 1];

      // Considera o crossfade: a cena atual vai até o início do crossfade da próxima
      const sceneEndWithCrossfade = nextTimeline
        ? nextTimeline.startFrame - safeRevealStyle.crossfadeDuration / 2
        : timeline.endFrame;

      if (frame >= timeline.startFrame && frame < sceneEndWithCrossfade) {
        return { timeline, index: i };
      }

      // Verifica se está no período de crossfade
      if (nextTimeline) {
        const crossfadeStart = nextTimeline.startFrame - safeRevealStyle.crossfadeDuration;
        const crossfadeEnd = nextTimeline.startFrame;

        if (frame >= crossfadeStart && frame < crossfadeEnd) {
          return { timeline, index: i, isTransitioning: true, nextTimeline };
        }
      }
    }

    // Se não encontrou, retorna a última cena
    if (sceneTimelines.length > 0) {
      return {
        timeline: sceneTimelines[sceneTimelines.length - 1],
        index: sceneTimelines.length - 1,
      };
    }

    return null;
  }, [frame, sceneTimelines, safeRevealStyle.crossfadeDuration]);

  // Calcula os elementos revelados e o progresso de reveal do elemento atual
  const revealData = useMemo(() => {
    if (!currentSceneData) {
      return { revealedElements: [], currentElementIndex: -1, revealProgress: 0 };
    }

    const { timeline } = currentSceneData;
    const revealedElements: Element[] = [];
    let currentElementIndex = -1;
    let revealProgress = 1;

    for (let i = 0; i < timeline.elements.length; i++) {
      const elemTimeline = timeline.elements[i];

      if (frame >= elemTimeline.startFrame) {
        revealedElements.push(elemTimeline.element);
        currentElementIndex = i;

        // Calcula progresso do reveal se ainda está na fase de reveal
        const revealEndFrame = elemTimeline.startFrame + safeRevealStyle.revealDuration;
        if (frame < revealEndFrame) {
          revealProgress = interpolate(
            frame,
            [elemTimeline.startFrame, revealEndFrame],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
        } else {
          revealProgress = 1;
        }
      }
    }

    return { revealedElements, currentElementIndex, revealProgress };
  }, [frame, currentSceneData, safeRevealStyle.revealDuration]);

  // Encontra a legenda atual
  const currentSubtitleText = useMemo(() => {
    const activeSubtitle = subtitles.find(
      (sub) => frame >= sub.startFrame && frame < sub.endFrame
    );
    return activeSubtitle?.text || '';
  }, [frame, subtitles]);

  // New flow: use NewFlowVideo component (AFTER all hooks)
  if (isNewFlowMode) {
    return (
      <NewFlowVideo
        imageBlocks={imageBlocks}
        backgroundColor={projectData.revealStyle?.backgroundColor || '#FFFFFF'}
        crossfadeDuration={projectData.revealStyle?.crossfadeDuration || 15}
        revealFraction={0.6}
        showSubtitles={projectData.showSubtitlesInVideo ?? false}
        audioUrl={projectData.audioUrl || undefined}
      />
    );
  }

  // Se não há dados, mostra tela vazia (legacy mode)
  if (!imageUrl || sceneTimelines.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: safeRevealStyle.backgroundColor }}>
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

  if (!currentSceneData) {
    return (
      <AbsoluteFill style={{ backgroundColor: safeRevealStyle.backgroundColor }} />
    );
  }

  const { timeline, isTransitioning, nextTimeline } = currentSceneData;

  // Calcula opacidade para crossfade
  let opacity = 1;
  if (isTransitioning && nextTimeline) {
    const crossfadeStart = nextTimeline.startFrame - safeRevealStyle.crossfadeDuration;
    opacity = interpolate(
      frame,
      [crossfadeStart, nextTimeline.startFrame],
      [1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  return (
    <AbsoluteFill>
      {/* Cena atual com possível fade out */}
      <AbsoluteFill style={{ opacity }}>
        <SceneRenderer
          scene={timeline.scene}
          imageUrl={imageUrl}
          imageWidth={imageDimensions.width}
          imageHeight={imageDimensions.height}
          revealedElements={revealData.revealedElements}
          currentElementIndex={revealData.currentElementIndex}
          revealProgress={revealData.revealProgress}
          currentSubtitleText={currentSubtitleText}
          backgroundColor={safeRevealStyle.backgroundColor}
        />
      </AbsoluteFill>

      {/* Próxima cena com fade in (durante transição) */}
      {isTransitioning && nextTimeline && (
        <AbsoluteFill style={{ opacity: 1 - opacity }}>
          <SceneRenderer
            scene={nextTimeline.scene}
            imageUrl={imageUrl}
            imageWidth={imageDimensions.width}
            imageHeight={imageDimensions.height}
            revealedElements={[]}
            currentElementIndex={-1}
            revealProgress={0}
            currentSubtitleText=""
            backgroundColor={safeRevealStyle.backgroundColor}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
