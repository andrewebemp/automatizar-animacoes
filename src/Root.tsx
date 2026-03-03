import React from 'react';
import { Composition, getInputProps } from 'remotion';
import { ZoomVideo } from './components/video';
import { VideoCompositionNew } from './components/video/VideoCompositionNew';
import { VideoCompositionTimeline } from './components/video/VideoCompositionTimeline';
import { ExportComposition } from './components/video/ExportComposition';
import type { ProjectData } from './types';
import type { ProjectNew } from './types/ProjectNew';
import type { TimelineProject } from './types/TimelineProject';
import { createEmptyProject } from './types/ProjectData';
import { createEmptyProjectNew, getProjectDurationFrames } from './types/ProjectNew';
import { createEmptyTimelineProject, getTimelineProjectDurationFrames } from './types/TimelineProject';

// Dados de exemplo para desenvolvimento (fluxo legado)
const exampleProjectData: ProjectData = {
  ...createEmptyProject(),
  imageUrl: '',
  imageDimensions: { width: 1920, height: 1080 },
  scenes: [],
  subtitles: [],
};

// Dados de exemplo para desenvolvimento (novo fluxo)
const exampleProjectNew: ProjectNew = createEmptyProjectNew();

// Dados de exemplo para desenvolvimento (fluxo Timeline)
const exampleTimelineProject: TimelineProject = createEmptyTimelineProject();

/**
 * Calcula a duração total do vídeo baseado nas legendas (fluxo legado).
 */
function calculateDuration(projectData: ProjectData): number {
  if (projectData.subtitles.length === 0) {
    return 300; // 10 segundos padrão a 30fps
  }

  const lastSubtitle = projectData.subtitles[projectData.subtitles.length - 1];
  // Adiciona 1 segundo após a última legenda
  return lastSubtitle.endFrame + projectData.videoConfig.fps;
}

// Wrapper para o componente de vídeo (fluxo legado)
const ZoomVideoWrapper: React.FC = () => {
  const inputProps = getInputProps() as { projectData?: ProjectData };
  // Garante que projectData tem valores válidos para evitar erro "reading 'width'"
  const rawData = inputProps.projectData;
  const projectData: ProjectData = rawData ? {
    ...rawData,
    imageDimensions: rawData.imageDimensions || { width: 1920, height: 1080 },
    scenes: rawData.scenes || [],
    subtitles: rawData.subtitles || [],
    imageBlocks: rawData.imageBlocks || [],
  } : exampleProjectData;
  return <ZoomVideo projectData={projectData} />;
};

// Wrapper para o novo componente de vídeo
const VideoCompositionNewWrapper: React.FC = () => {
  const inputProps = getInputProps() as { project?: ProjectNew };
  // Garante que project tem valores válidos
  const rawProject = inputProps.project;
  const project: ProjectNew = rawProject ? {
    ...rawProject,
    scenes: (rawProject.scenes || []).map(scene => ({
      ...scene,
      imageWidth: scene.imageWidth > 0 ? scene.imageWidth : 1920,
      imageHeight: scene.imageHeight > 0 ? scene.imageHeight : 1080,
      imageUrl: scene.imageUrl || '',
      segments: scene.segments || [],
    })),
    subtitles: rawProject.subtitles || [],
    videoConfig: rawProject.videoConfig || { width: 1920, height: 1080, fps: 30 },
  } : exampleProjectNew;
  return <VideoCompositionNew project={project} />;
};

// Wrapper para a composição de exportação (totalmente isolada e segura)
const ExportCompositionWrapper: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputProps = getInputProps() as { project?: any };
  // A ExportComposition faz validação interna completa, então passamos o que vier
  return <ExportComposition project={inputProps.project || {}} />;
};

// Wrapper para a composição Timeline
const VideoTimelineWrapper: React.FC = () => {
  const inputProps = getInputProps() as { project?: TimelineProject };
  // Garante que project tem valores válidos
  const rawProject = inputProps.project;
  const project: TimelineProject = rawProject ? {
    ...rawProject,
    scenes: (rawProject.scenes || []).map(scene => ({
      ...scene,
      imageWidth: scene.imageWidth > 0 ? scene.imageWidth : 1920,
      imageHeight: scene.imageHeight > 0 ? scene.imageHeight : 1080,
      imageUrl: scene.imageUrl || '',
      elements: scene.elements || [],
      erasedStrokes: scene.erasedStrokes || [],
    })),
    videoConfig: rawProject.videoConfig || { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    audioDuration: rawProject.audioDuration || 0,
    audioUrl: rawProject.audioUrl || '',
    backgroundColor: rawProject.backgroundColor || '#ffffff',
  } : exampleTimelineProject;
  return <VideoCompositionTimeline project={project} />;
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Composição legada - mantida para compatibilidade */}
      <Composition
        id="ZoomVideo"
        component={ZoomVideoWrapper}
        durationInFrames={calculateDuration(exampleProjectData)}
        fps={exampleProjectData.videoConfig.fps}
        width={exampleProjectData.videoConfig.width}
        height={exampleProjectData.videoConfig.height}
      />

      {/* Nova composição simplificada */}
      <Composition
        id="VideoNew"
        component={VideoCompositionNewWrapper}
        durationInFrames={getProjectDurationFrames(exampleProjectNew)}
        fps={exampleProjectNew.videoConfig.fps}
        width={exampleProjectNew.videoConfig.width}
        height={exampleProjectNew.videoConfig.height}
      />

      {/* Composição de exportação - totalmente isolada e segura */}
      <Composition
        id="Export"
        component={ExportCompositionWrapper}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Composição para o modo Timeline */}
      <Composition
        id="VideoTimeline"
        component={VideoTimelineWrapper}
        durationInFrames={getTimelineProjectDurationFrames(exampleTimelineProject) || 300}
        fps={exampleTimelineProject.videoConfig.fps}
        width={exampleTimelineProject.videoConfig.width}
        height={exampleTimelineProject.videoConfig.height}
      />
    </>
  );
};
