/**
 * Exportador específico para Kdenlive
 * Baseado na estrutura real de arquivos .kdenlive
 */

import { BaseExporter } from '../BaseExporter';
import type { ProjectNew } from '../../types/ProjectNew';
import type { ExportOptions, ExportResult, EditorType, TimelineClip } from '../types';

/**
 * Gera um UUID no formato Kdenlive
 */
function generateUUID(): string {
  return '{' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }) + '}';
}

/**
 * Converte frames para timecode (00:00:00.000)
 */
function framesToTimecode(frames: number, fps: number): string {
  const totalSeconds = frames / fps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.round((totalSeconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Gera o nome do arquivo de mídia baseado no índice
 */
function getMediaFileName(index: number, mimeType: string): string {
  const ext = mimeType.split('/')[1] || 'png';
  return `image_${index}.${ext}`;
}

/**
 * Detecta o tipo MIME de um data URL
 */
function getMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'image/png';
}

/**
 * Obtém a extensão do arquivo de áudio baseado no data URL ou caminho
 */
function getAudioExtension(audioUrl: string): string {
  if (audioUrl.startsWith('data:')) {
    const mimeType = getMimeTypeFromDataUrl(audioUrl);
    // Mapeia MIME types comuns para extensões
    const mimeToExt: Record<string, string> = {
      'audio/mpeg': 'mpeg',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/aac': 'aac',
      'audio/flac': 'flac',
      'audio/m4a': 'm4a',
      'audio/x-m4a': 'm4a',
    };
    return mimeToExt[mimeType] || mimeType.split('/')[1] || 'mp3';
  }
  // Se for caminho de arquivo, extrai a extensão
  const ext = audioUrl.split('.').pop()?.toLowerCase();
  return ext || 'mp3';
}

/**
 * Exportador para projetos Kdenlive (.kdenlive)
 */
export class KdenliveExporter extends BaseExporter {
  editorId: EditorType = 'kdenlive';
  name = 'Kdenlive';
  extension = '.kdenlive';
  format = 'XML (MLT)';

  private mltVersion = '7.33.0';
  private kdenliveVersion = '25.08.3';

  /**
   * Exporta o projeto para formato Kdenlive
   */
  async export(project: ProjectNew, options: ExportOptions): Promise<ExportResult> {
    const warnings: string[] = [];

    // Valida o projeto
    const validation = this.canExport(project);
    if (!validation.valid) {
      return {
        success: false,
        projectPath: options.outputPath,
        errors: validation.issues,
      };
    }

    try {
      // Adiciona avisos sobre limitações
      warnings.push('Animações de reveal foram convertidas para efeito de slide/fade');

      if (project.showSubtitles) {
        warnings.push('Legendas não foram incluídas - adicione manualmente no Kdenlive');
      }

      // Gera o XML do projeto
      const projectXml = this.generateKdenliveXml(project, options);

      return {
        success: true,
        projectPath: options.outputPath,
        mediaFolder: options.mediaHandling === 'copy' ? 'media' : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        ...({ projectContent: projectXml } as any),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      return {
        success: false,
        projectPath: options.outputPath,
        errors: [`Erro ao gerar projeto: ${errorMsg}`],
      };
    }
  }

  /**
   * Gera o XML completo do projeto Kdenlive
   */
  private generateKdenliveXml(project: ProjectNew, options: ExportOptions): string {
    const { width, height, fps } = project.videoConfig;
    const projectUuid = generateUUID();
    const sessionId = generateUUID();
    const documentId = Date.now().toString();

    // Usa projectToTimeline para obter os clips com crop correto
    const timelineData = this.projectToTimeline(project);
    const clips = timelineData.clips;

    // Calcula duração total
    const totalFrames = timelineData.totalFrames;
    const totalDuration = framesToTimecode(totalFrames, fps);

    // Cria mapa de imagens únicas (para não duplicar producers)
    const uniqueImages = new Map<string, { index: number; scene: typeof project.scenes[0] }>();
    project.scenes.forEach((scene, index) => {
      if (!uniqueImages.has(scene.imageUrl)) {
        uniqueImages.set(scene.imageUrl, { index, scene });
      }
    });

    // Gera perfil de vídeo
    const aspectNum = width > height ? 16 : 9;
    const aspectDen = width > height ? 9 : 16;
    const profileDesc = `${width}x${height} ${fps}fps`;

    // Extrai o diretório do arquivo de projeto para usar como root
    const projectDir = options.outputPath.replace(/[/\\][^/\\]+$/, '').replace(/\\/g, '/');

    let xml = `<?xml version='1.0' encoding='utf-8'?>
<mlt LC_NUMERIC="C" producer="main_bin" root="${projectDir}" version="${this.mltVersion}">
 <profile colorspace="709" description="${profileDesc}" display_aspect_den="${aspectDen}" display_aspect_num="${aspectNum}" frame_rate_den="1" frame_rate_num="${fps}" height="${height}" progressive="1" sample_aspect_den="1" sample_aspect_num="1" width="${width}"/>
`;

    // Adiciona producers de áudio (chain)
    if (project.audioUrl) {
      const audioExt = getAudioExtension(project.audioUrl);
      const audioFileName = options.mediaHandling === 'copy' ? `media/audio.${audioExt}` : project.audioUrl;
      const audioDuration = framesToTimecode(totalFrames, fps);
      xml += ` <chain id="chain1" out="${audioDuration}">
  <property name="length">${audioDuration}</property>
  <property name="eof">pause</property>
  <property name="resource">${this.escapeXml(audioFileName)}</property>
  <property name="mlt_service">avformat</property>
  <property name="seekable">1</property>
  <property name="audio_index">0</property>
  <property name="video_index">-1</property>
  <property name="kdenlive:id">2</property>
  <property name="kdenlive:clip_type">1</property>
  <property name="kdenlive:folderid">-1</property>
 </chain>
`;
    }

    // Adiciona producers de imagens (um por imagem única)
    xml += this.generateProducers(project, options, fps, uniqueImages);

    // Producer de fundo preto
    xml += ` <producer id="producer0" in="00:00:00.000" out="${totalDuration}">
  <property name="length">2147483647</property>
  <property name="eof">continue</property>
  <property name="resource">black</property>
  <property name="aspect_ratio">1</property>
  <property name="mlt_service">color</property>
  <property name="kdenlive:playlistid">black_track</property>
  <property name="mlt_image_format">rgba</property>
  <property name="set.test_audio">0</property>
 </producer>
`;

    // Playlists e tractors de áudio (vazios se não houver áudio)
    xml += ` <playlist id="playlist0">
  <property name="kdenlive:audio_track">1</property>
 </playlist>
 <playlist id="playlist1">
  <property name="kdenlive:audio_track">1</property>
 </playlist>
 <tractor id="tractor0" in="00:00:00.000">
  <property name="kdenlive:audio_track">1</property>
  <property name="kdenlive:trackheight">75</property>
  <property name="kdenlive:timeline_active">1</property>
  <property name="kdenlive:collapsed">0</property>
  <track hide="video" producer="playlist0"/>
  <track hide="video" producer="playlist1"/>
  <filter id="filter0">
   <property name="window">75</property>
   <property name="max_gain">20dB</property>
   <property name="mlt_service">volume</property>
   <property name="internal_added">237</property>
   <property name="disable">1</property>
  </filter>
  <filter id="filter1">
   <property name="channel">-1</property>
   <property name="mlt_service">panner</property>
   <property name="internal_added">237</property>
   <property name="start">0.5</property>
   <property name="disable">1</property>
  </filter>
  <filter id="filter2">
   <property name="iec_scale">0</property>
   <property name="mlt_service">audiolevel</property>
   <property name="dbpeak">1</property>
   <property name="disable">1</property>
  </filter>
 </tractor>
`;

    // Playlist de áudio com conteúdo
    if (project.audioUrl) {
      const audioExt = getAudioExtension(project.audioUrl);
      const audioFileName = options.mediaHandling === 'copy' ? `media/audio.${audioExt}` : project.audioUrl;
      const audioDuration = framesToTimecode(totalFrames, fps);
      xml += ` <chain id="chain0" out="${audioDuration}">
  <property name="length">${audioDuration}</property>
  <property name="eof">pause</property>
  <property name="resource">${this.escapeXml(audioFileName)}</property>
  <property name="mlt_service">avformat-novalidate</property>
  <property name="seekable">1</property>
  <property name="audio_index">0</property>
  <property name="video_index">-1</property>
  <property name="kdenlive:id">2</property>
  <property name="set.test_audio">0</property>
  <property name="set.test_image">1</property>
 </chain>
 <playlist id="playlist2">
  <property name="kdenlive:audio_track">1</property>
  <entry in="00:00:00.000" out="${audioDuration}" producer="chain0">
   <property name="kdenlive:id">2</property>
  </entry>
 </playlist>
`;
    } else {
      xml += ` <playlist id="playlist2">
  <property name="kdenlive:audio_track">1</property>
 </playlist>
`;
    }

    xml += ` <playlist id="playlist3">
  <property name="kdenlive:audio_track">1</property>
 </playlist>
 <tractor id="tractor1" in="00:00:00.000" out="${totalDuration}">
  <property name="kdenlive:audio_track">1</property>
  <property name="kdenlive:trackheight">75</property>
  <property name="kdenlive:timeline_active">1</property>
  <property name="kdenlive:collapsed">0</property>
  <track hide="video" producer="playlist2"/>
  <track hide="video" producer="playlist3"/>
  <filter id="filter3">
   <property name="window">75</property>
   <property name="max_gain">20dB</property>
   <property name="mlt_service">volume</property>
   <property name="internal_added">237</property>
   <property name="disable">1</property>
  </filter>
  <filter id="filter4">
   <property name="channel">-1</property>
   <property name="mlt_service">panner</property>
   <property name="internal_added">237</property>
   <property name="start">0.5</property>
   <property name="disable">1</property>
  </filter>
  <filter id="filter5">
   <property name="iec_scale">0</property>
   <property name="mlt_service">audiolevel</property>
   <property name="dbpeak">1</property>
   <property name="disable">1</property>
  </filter>
 </tractor>
`;

    // Playlist de vídeo com os segmentos (clips com crop)
    const timelineEntries = this.generateTimelineEntries(project, clips, fps, uniqueImages, width, height);
    xml += ` <playlist id="playlist4">
${timelineEntries}
 </playlist>
 <playlist id="playlist5"/>
 <tractor id="tractor2" in="00:00:00.000" out="${totalDuration}">
  <property name="kdenlive:trackheight">75</property>
  <property name="kdenlive:timeline_active">1</property>
  <property name="kdenlive:collapsed">0</property>
  <property name="kdenlive:thumbs_format">0</property>
  <track hide="audio" producer="playlist4"/>
  <track hide="audio" producer="playlist5"/>
 </tractor>
`;

    // Tractor principal (sequência)
    xml += ` <tractor id="tractor3" in="00:00:00.000" out="${totalDuration}">
  <property name="kdenlive:duration">${totalDuration}</property>
  <property name="kdenlive:maxduration">${totalFrames}</property>
  <property name="kdenlive:clipname">${this.escapeXml(project.name || 'Sequence 1')}</property>
  <property name="kdenlive:uuid">${projectUuid}</property>
  <property name="kdenlive:producer_type">17</property>
  <property name="kdenlive:id">1</property>
  <property name="kdenlive:clip_type">0</property>
  <property name="kdenlive:folderid">-1</property>
  <property name="kdenlive:sequenceproperties.activeTrack">2</property>
  <property name="kdenlive:sequenceproperties.audioTarget">1</property>
  <property name="kdenlive:sequenceproperties.hasAudio">1</property>
  <property name="kdenlive:sequenceproperties.hasVideo">1</property>
  <property name="kdenlive:sequenceproperties.tracks">3</property>
  <track producer="producer0"/>
  <track producer="tractor0"/>
  <track producer="tractor1"/>
  <track producer="tractor2"/>
  <transition id="transition0">
   <property name="a_track">0</property>
   <property name="b_track">1</property>
   <property name="mlt_service">mix</property>
   <property name="kdenlive_id">mix</property>
   <property name="internal_added">237</property>
   <property name="always_active">1</property>
   <property name="accepts_blanks">1</property>
   <property name="sum">1</property>
  </transition>
  <transition id="transition1">
   <property name="a_track">0</property>
   <property name="b_track">2</property>
   <property name="mlt_service">mix</property>
   <property name="kdenlive_id">mix</property>
   <property name="internal_added">237</property>
   <property name="always_active">1</property>
   <property name="accepts_blanks">1</property>
   <property name="sum">1</property>
  </transition>
  <transition id="transition2">
   <property name="a_track">0</property>
   <property name="b_track">3</property>
   <property name="compositing">0</property>
   <property name="distort">0</property>
   <property name="mlt_service">qtblend</property>
   <property name="kdenlive_id">qtblend</property>
   <property name="internal_added">237</property>
   <property name="always_active">1</property>
  </transition>
  <filter id="filter6">
   <property name="window">75</property>
   <property name="max_gain">20dB</property>
   <property name="mlt_service">volume</property>
   <property name="internal_added">237</property>
   <property name="disable">1</property>
  </filter>
  <filter id="filter7">
   <property name="channel">-1</property>
   <property name="mlt_service">panner</property>
   <property name="internal_added">237</property>
   <property name="start">0.5</property>
   <property name="disable">1</property>
  </filter>
 </tractor>
`;

    // Main bin com todas as referências
    xml += ` <playlist id="main_bin">
  <property name="kdenlive:docproperties.activetimeline">${projectUuid}</property>
  <property name="kdenlive:docproperties.audioChannels">2</property>
  <property name="kdenlive:docproperties.documentid">${documentId}</property>
  <property name="kdenlive:docproperties.kdenliveversion">${this.kdenliveVersion}</property>
  <property name="kdenlive:docproperties.opensequences">${projectUuid}</property>
  <property name="kdenlive:docproperties.sessionid">${sessionId}</property>
  <property name="kdenlive:docproperties.uuid">${projectUuid}</property>
  <property name="kdenlive:docproperties.version">1.1</property>
  <property name="xml_retain">1</property>
`;

    // Adiciona referências aos producers no main_bin
    if (project.audioUrl) {
      const audioDuration = framesToTimecode(totalFrames, fps);
      xml += `  <entry in="00:00:00.000" out="${audioDuration}" producer="chain1"/>
`;
    }

    // Referências às imagens únicas
    uniqueImages.forEach((data, _imageUrl) => {
      const scene = data.scene;
      const duration = scene.endFrame - scene.startFrame;
      const inTime = framesToTimecode(0, fps);
      const outTime = framesToTimecode(duration, fps);
      xml += `  <entry in="${inTime}" out="${outTime}" producer="producer${data.index + 1}"/>
`;
    });

    // Referência à sequência
    xml += `  <entry in="00:00:00.000" out="${totalDuration}" producer="tractor3"/>
 </playlist>
`;

    // Tractor final
    xml += ` <tractor id="tractor4" in="00:00:00.000" out="${totalDuration}">
  <property name="kdenlive:projectTractor">1</property>
  <track in="00:00:00.000" out="${totalDuration}" producer="tractor3"/>
 </tractor>
</mlt>
`;

    return xml;
  }

  /**
   * Gera os producers de imagem (um por imagem única)
   */
  private generateProducers(
    project: ProjectNew,
    options: ExportOptions,
    fps: number,
    uniqueImages: Map<string, { index: number; scene: typeof project.scenes[0] }>
  ): string {
    let xml = '';

    uniqueImages.forEach((data, imageUrl) => {
      const scene = data.scene;
      const producerIndex = data.index + 1;
      const duration = scene.endFrame - scene.startFrame;
      const durationTimecode = framesToTimecode(duration, fps);
      const lengthTimecode = framesToTimecode(duration + 1, fps);

      // Determina o caminho do arquivo
      let resourcePath: string;
      if (options.mediaHandling === 'copy') {
        const mimeType = imageUrl.startsWith('data:')
          ? getMimeTypeFromDataUrl(imageUrl)
          : 'image/png';
        resourcePath = `media/${getMediaFileName(data.index, mimeType)}`;
      } else {
        resourcePath = imageUrl;
      }

      xml += ` <producer id="producer${producerIndex}" in="00:00:00.000" out="${durationTimecode}">
  <property name="length">${lengthTimecode}</property>
  <property name="eof">pause</property>
  <property name="resource">${this.escapeXml(resourcePath)}</property>
  <property name="ttl">25</property>
  <property name="aspect_ratio">1</property>
  <property name="meta.media.progressive">1</property>
  <property name="seekable">1</property>
  <property name="format">1</property>
  <property name="meta.media.width">${scene.imageWidth}</property>
  <property name="meta.media.height">${scene.imageHeight}</property>
  <property name="mlt_service">qimage</property>
  <property name="kdenlive:duration">${durationTimecode}</property>
  <property name="xml">was here</property>
  <property name="kdenlive:folderid">-1</property>
  <property name="kdenlive:id">${producerIndex + 10}</property>
  <property name="kdenlive:clip_type">2</property>
 </producer>
`;
    });

    return xml;
  }

  /**
   * Calcula a direção efetiva do reveal baseado na região e posição na imagem
   */
  private calculateEffectiveDirection(
    clip: TimelineClip,
    videoWidth: number,
    videoHeight: number
  ): 'left' | 'right' | 'top' | 'bottom' | 'center' {
    const direction = clip.revealDirection || 'auto';

    if (direction !== 'auto') {
      return direction;
    }

    // Auto: determina baseado na posição da região na imagem
    if (!clip.crop) {
      return 'top'; // Padrão se não tem crop
    }

    const regionCenterX = clip.crop.x + clip.crop.width / 2;
    const regionCenterY = clip.crop.y + clip.crop.height / 2;
    const imageCenterX = clip.imageWidth / 2;
    const imageCenterY = clip.imageHeight / 2;

    const deltaX = regionCenterX - imageCenterX;
    const deltaY = regionCenterY - imageCenterY;

    // Determina a direção baseado no quadrante
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? 'left' : 'right';
    } else {
      return deltaY > 0 ? 'top' : 'bottom';
    }
  }

  /**
   * Gera as entradas na timeline de vídeo (um por segmento/clip)
   * Implementa animação de reveal usando keyframes no efeito qtblend
   */
  private generateTimelineEntries(
    project: ProjectNew,
    clips: TimelineClip[],
    fps: number,
    uniqueImages: Map<string, { index: number; scene: typeof project.scenes[0] }>,
    videoWidth: number,
    videoHeight: number
  ): string {
    let xml = '';
    let filterIndex = 10;

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const duration = clip.durationFrames;
      const durationTimecode = framesToTimecode(duration, fps);
      const inTimecode = framesToTimecode(0, fps);

      // Encontra o producer correto para esta imagem
      const imageData = uniqueImages.get(clip.mediaPath);
      const producerIndex = imageData ? imageData.index + 1 : 1;

      // Calcula tempo para o reveal (baseado em revealFraction)
      const revealFraction = clip.revealFraction || 0.6;
      const revealFrames = Math.round(duration * revealFraction);
      const revealEndTimecode = framesToTimecode(revealFrames, fps);

      // Direção do reveal
      const direction = this.calculateEffectiveDirection(clip, videoWidth, videoHeight);

      xml += `  <entry in="${inTimecode}" out="${durationTimecode}" producer="producer${producerIndex}">
   <property name="kdenlive:id">${producerIndex + 10}</property>
`;

      // Calcula dimensões de exibição da imagem (fit to screen)
      const imgW = clip.imageWidth;
      const imgH = clip.imageHeight;
      const imageAspect = imgW / imgH;
      const videoAspect = videoWidth / videoHeight;

      let displayW: number;
      let displayH: number;
      let finalX: number;
      let finalY: number;

      if (imageAspect > videoAspect) {
        displayW = videoWidth;
        displayH = videoWidth / imageAspect;
        finalX = 0;
        finalY = Math.round((videoHeight - displayH) / 2);
      } else {
        displayH = videoHeight;
        displayW = videoHeight * imageAspect;
        finalX = Math.round((videoWidth - displayW) / 2);
        finalY = 0;
      }

      // Calcula posição inicial baseado na direção do reveal
      let startX = finalX;
      let startY = finalY;
      const slideDistance = Math.max(videoWidth, videoHeight);

      switch (direction) {
        case 'left':
          startX = finalX + slideDistance; // Entra da direita
          break;
        case 'right':
          startX = finalX - slideDistance; // Entra da esquerda
          break;
        case 'top':
          startY = finalY + slideDistance; // Entra de baixo
          break;
        case 'bottom':
          startY = finalY - slideDistance; // Entra de cima
          break;
        case 'center':
          // Para center, usa fade em vez de slide
          startX = finalX;
          startY = finalY;
          break;
      }

      const displayWRound = Math.round(displayW);
      const displayHRound = Math.round(displayH);

      // Rect com keyframes para animação de slide
      // Formato: "timecode=X Y W H opacity;timecode=X Y W H opacity"
      if (direction === 'center') {
        // Center: usa opacity para fade in
        const rectKeyframes = `00:00:00.000=${finalX} ${finalY} ${displayWRound} ${displayHRound} 0.000000;${revealEndTimecode}=${finalX} ${finalY} ${displayWRound} ${displayHRound} 1.000000`;
        xml += `   <filter id="filter${filterIndex}">
    <property name="rotate_center">1</property>
    <property name="mlt_service">qtblend</property>
    <property name="kdenlive_id">qtblend</property>
    <property name="rect">${rectKeyframes}</property>
    <property name="compositing">0</property>
    <property name="distort">0</property>
   </filter>
`;
      } else {
        // Slide: anima posição
        const rectKeyframes = `00:00:00.000=${startX} ${startY} ${displayWRound} ${displayHRound} 1.000000;${revealEndTimecode}=${finalX} ${finalY} ${displayWRound} ${displayHRound} 1.000000`;
        xml += `   <filter id="filter${filterIndex}">
    <property name="rotate_center">1</property>
    <property name="mlt_service">qtblend</property>
    <property name="kdenlive_id">qtblend</property>
    <property name="rect">${rectKeyframes}</property>
    <property name="compositing">0</property>
    <property name="distort">0</property>
   </filter>
`;
      }
      filterIndex++;

      xml += `  </entry>
`;
    }

    return xml;
  }
}

export default KdenliveExporter;
