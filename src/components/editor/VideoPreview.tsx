import React, { useMemo } from 'react';
import { Player } from '@remotion/player';
import { ZoomVideo } from '../video/ZoomVideo';
import type { ProjectData } from '../../types';

interface VideoPreviewProps {
  projectData: ProjectData;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ projectData }) => {
  // Calcula a duração total
  const durationInFrames = useMemo(() => {
    if (projectData.subtitles.length === 0) {
      return 300; // 10 segundos padrão
    }

    const lastSubtitle =
      projectData.subtitles[projectData.subtitles.length - 1];
    // Adiciona 1 segundo após a última legenda
    return lastSubtitle.endFrame + projectData.videoConfig.fps;
  }, [projectData.subtitles, projectData.videoConfig.fps]);

  // Verifica se há dados suficientes para preview
  const hasData =
    projectData.imageUrl && projectData.scenes.length > 0;

  if (!hasData) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 40,
          color: '#666',
        }}
      >
        <div style={{ fontSize: 48 }}>🎬</div>
        <div style={{ fontSize: 16, textAlign: 'center' }}>
          Carregue uma imagem e crie cenas para visualizar o preview
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <Player
        component={ZoomVideo}
        inputProps={{ projectData }}
        durationInFrames={durationInFrames}
        fps={projectData.videoConfig.fps}
        compositionWidth={projectData.videoConfig.width}
        compositionHeight={projectData.videoConfig.height}
        style={{
          width: '100%',
          maxWidth: 800,
          aspectRatio: `${projectData.videoConfig.width} / ${projectData.videoConfig.height}`,
        }}
        controls
        autoPlay={false}
        loop
      />
      <div style={{ color: '#888', fontSize: 12 }}>
        {durationInFrames} frames • {projectData.videoConfig.fps} FPS •{' '}
        {projectData.videoConfig.width}x{projectData.videoConfig.height}
      </div>
    </div>
  );
};
