/**
 * Exportador para formato OpenShot (.osp)
 * OpenShot usa formato JSON para seus projetos
 */

import { BaseExporter } from '../BaseExporter';
import type { ProjectNew } from '../../types/ProjectNew';
import type {
  ExportOptions,
  ExportResult,
  EditorType,
  TimelineData,
  TimelineClip,
} from '../types';

/**
 * Estrutura do arquivo de projeto OpenShot
 */
interface OpenShotProject {
  id: string;
  fps: { num: number; den: number };
  width: number;
  height: number;
  sample_rate: number;
  channels: number;
  channel_layout: number;
  settings: Record<string, any>;
  files: OpenShotFile[];
  clips: OpenShotClip[];
  effects: any[];
  layers: OpenShotLayer[];
  markers: any[];
  progress: any[];
  history: { undo: any[]; redo: any[] };
  version: { openshot_version: string; libopenshot_version: string };
}

interface OpenShotFile {
  id: string;
  path: string;
  media_type: 'image' | 'video' | 'audio';
  reader: {
    has_video: boolean;
    has_audio: boolean;
    has_single_image: boolean;
    duration: number;
    width: number;
    height: number;
    fps: { num: number; den: number };
    video_bit_rate: number;
    pixel_ratio: { num: number; den: number };
  };
}

interface OpenShotClip {
  id: string;
  file_id: string;
  position: number;
  start: number;
  end: number;
  layer: number;
  title: string;
  reader: { has_video: boolean; has_audio: boolean };
  crop_x: { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> };
  crop_y: { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> };
  crop_width: { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> };
  crop_height: { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> };
  location_x: { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> };
  location_y: { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> };
  scale_x: { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> };
  scale_y: { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> };
  alpha: { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> };
}

interface OpenShotLayer {
  id: number;
  label: string;
  number: number;
  y: number;
  lock: boolean;
}

/**
 * Exportador para projetos OpenShot (.osp)
 */
export class OpenShotExporter extends BaseExporter {
  editorId: EditorType = 'openshot';
  name = 'OpenShot';
  extension = '.osp';
  format = 'JSON';

  /**
   * Versão do OpenShot para compatibilidade
   */
  private openShotVersion = '3.1.1';
  private libOpenShotVersion = '0.3.2';

  /**
   * Exporta o projeto para formato OpenShot
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
      // Converte projeto para dados de timeline
      const timeline = this.projectToTimeline(project);

      // Adiciona avisos sobre limitações
      warnings.push('Animações de reveal foram convertidas para crops estáticos');

      if (project.showSubtitles) {
        warnings.push('Legendas não foram incluídas - adicione manualmente no OpenShot');
      }

      // Determina o caminho base para mídias
      const basePath = options.outputPath.replace(/\.[^.]+$/, '');

      // Gera o JSON do projeto
      const projectData = this.generateOpenShotProject(timeline, basePath, options);
      const projectJson = JSON.stringify(projectData, null, 2);

      return {
        success: true,
        projectPath: options.outputPath,
        mediaFolder: options.mediaHandling === 'copy' ? `${basePath}/media` : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        ...({ projectContent: projectJson } as any),
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
   * Gera o objeto de projeto OpenShot completo
   */
  private generateOpenShotProject(
    timeline: TimelineData,
    basePath: string,
    options: ExportOptions
  ): OpenShotProject {
    const { width, height, fps, totalFrames } = timeline;
    const totalDuration = totalFrames / fps;

    return {
      id: this.generateId('project'),
      fps: { num: fps, den: 1 },
      width,
      height,
      sample_rate: 48000,
      channels: 2,
      channel_layout: 3,
      settings: this.getDefaultSettings(),
      files: this.generateFiles(timeline, basePath, options),
      clips: this.generateClips(timeline, basePath, options),
      effects: [],
      layers: this.generateLayers(timeline),
      markers: [],
      progress: [],
      history: { undo: [], redo: [] },
      version: {
        openshot_version: this.openShotVersion,
        libopenshot_version: this.libOpenShotVersion,
      },
    };
  }

  /**
   * Gera a lista de arquivos (mídias)
   */
  private generateFiles(
    timeline: TimelineData,
    basePath: string,
    options: ExportOptions
  ): OpenShotFile[] {
    const files: OpenShotFile[] = [];
    const addedMedia = new Set<string>();

    // Arquivos de imagem
    for (const clip of timeline.clips) {
      if (!addedMedia.has(clip.mediaPath)) {
        addedMedia.add(clip.mediaPath);

        const mediaPath = this.getMediaPath(clip.mediaPath, basePath, options);

        files.push({
          id: this.generateId('file'),
          path: mediaPath,
          media_type: 'image',
          reader: {
            has_video: true,
            has_audio: false,
            has_single_image: true,
            duration: timeline.totalFrames / timeline.fps,
            width: clip.imageWidth,
            height: clip.imageHeight,
            fps: { num: timeline.fps, den: 1 },
            video_bit_rate: 0,
            pixel_ratio: { num: 1, den: 1 },
          },
        });
      }
    }

    // Arquivo de áudio
    if (timeline.audioTrack) {
      const audioPath = this.getMediaPath(timeline.audioTrack.mediaPath, basePath, options);

      files.push({
        id: this.generateId('file'),
        path: audioPath,
        media_type: 'audio',
        reader: {
          has_video: false,
          has_audio: true,
          has_single_image: false,
          duration: (timeline.audioTrack.endFrame - timeline.audioTrack.startFrame) / timeline.fps,
          width: 0,
          height: 0,
          fps: { num: timeline.fps, den: 1 },
          video_bit_rate: 0,
          pixel_ratio: { num: 1, den: 1 },
        },
      });
    }

    return files;
  }

  /**
   * Gera a lista de clips
   */
  private generateClips(
    timeline: TimelineData,
    basePath: string,
    options: ExportOptions
  ): OpenShotClip[] {
    const clips: OpenShotClip[] = [];
    const { fps, width, height } = timeline;

    // Mapeia mídia para file id
    const mediaToFileId = new Map<string, string>();
    const files = this.generateFiles(timeline, basePath, options);

    for (const clip of timeline.clips) {
      const mediaPath = this.getMediaPath(clip.mediaPath, basePath, options);
      const file = files.find((f) => f.path === mediaPath);
      if (file) {
        mediaToFileId.set(clip.mediaPath, file.id);
      }
    }

    // Ordena clips por frame inicial
    const sortedClips = [...timeline.clips].sort((a, b) => a.startFrame - b.startFrame);

    for (const clip of sortedClips) {
      const fileId = mediaToFileId.get(clip.mediaPath) || '';
      const position = clip.startFrame / fps;
      const duration = clip.durationFrames / fps;

      // Calcula parâmetros de crop/scale
      const cropParams = this.calculateCropParameters(clip, timeline);

      clips.push({
        id: this.generateId('clip'),
        file_id: fileId,
        position,
        start: 0,
        end: duration,
        layer: 1,
        title: clip.subtitleText || 'Clip',
        reader: { has_video: true, has_audio: false },
        crop_x: this.createKeyframe(cropParams.cropX),
        crop_y: this.createKeyframe(cropParams.cropY),
        crop_width: this.createKeyframe(cropParams.cropW),
        crop_height: this.createKeyframe(cropParams.cropH),
        location_x: this.createKeyframe(cropParams.locX),
        location_y: this.createKeyframe(cropParams.locY),
        scale_x: this.createKeyframe(cropParams.scaleX),
        scale_y: this.createKeyframe(cropParams.scaleY),
        alpha: this.createKeyframe(1),
      });
    }

    // Clip de áudio
    if (timeline.audioTrack) {
      const audioFile = files.find((f) => f.media_type === 'audio');
      if (audioFile) {
        clips.push({
          id: this.generateId('clip'),
          file_id: audioFile.id,
          position: timeline.audioTrack.startFrame / fps,
          start: 0,
          end: (timeline.audioTrack.endFrame - timeline.audioTrack.startFrame) / fps,
          layer: 0,
          title: 'Audio',
          reader: { has_video: false, has_audio: true },
          crop_x: this.createKeyframe(0),
          crop_y: this.createKeyframe(0),
          crop_width: this.createKeyframe(1),
          crop_height: this.createKeyframe(1),
          location_x: this.createKeyframe(0),
          location_y: this.createKeyframe(0),
          scale_x: this.createKeyframe(1),
          scale_y: this.createKeyframe(1),
          alpha: this.createKeyframe(1),
        });
      }
    }

    return clips;
  }

  /**
   * Calcula parâmetros de crop para OpenShot
   * OpenShot usa valores normalizados (0-1) para crop
   */
  private calculateCropParameters(
    clip: TimelineClip,
    timeline: TimelineData
  ): {
    cropX: number;
    cropY: number;
    cropW: number;
    cropH: number;
    locX: number;
    locY: number;
    scaleX: number;
    scaleY: number;
  } {
    if (!clip.crop) {
      return {
        cropX: 0,
        cropY: 0,
        cropW: 1,
        cropH: 1,
        locX: 0,
        locY: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }

    const { x, y, width, height } = clip.crop;
    const { imageWidth, imageHeight } = clip;

    // Normaliza valores de crop (0-1)
    const cropX = x / imageWidth;
    const cropY = y / imageHeight;
    const cropW = width / imageWidth;
    const cropH = height / imageHeight;

    // Calcula escala para preencher a tela
    const scaleX = timeline.width / width;
    const scaleY = timeline.height / height;
    const scale = Math.min(scaleX, scaleY);

    return {
      cropX,
      cropY,
      cropW,
      cropH,
      locX: 0, // Centralizado
      locY: 0, // Centralizado
      scaleX: scale,
      scaleY: scale,
    };
  }

  /**
   * Cria um keyframe OpenShot com valor constante
   */
  private createKeyframe(value: number): { Points: Array<{ co: { X: number; Y: number }; interpolation: number }> } {
    return {
      Points: [
        {
          co: { X: 1, Y: value },
          interpolation: 0, // Constant
        },
      ],
    };
  }

  /**
   * Gera as layers do projeto
   */
  private generateLayers(timeline: TimelineData): OpenShotLayer[] {
    const layers: OpenShotLayer[] = [
      {
        id: 0,
        label: 'Audio',
        number: 0,
        y: 0,
        lock: false,
      },
      {
        id: 1,
        label: 'Video',
        number: 1,
        y: 100,
        lock: false,
      },
    ];

    return layers;
  }

  /**
   * Obtém o caminho da mídia formatado para OpenShot
   */
  private getMediaPath(
    originalPath: string,
    basePath: string,
    options: ExportOptions
  ): string {
    if (originalPath.startsWith('data:')) {
      return `${basePath}/media/image.png`;
    }

    if (options.mediaHandling === 'copy') {
      const fileName = originalPath.split(/[/\\]/).pop() || 'media';
      return `${basePath}/media/${fileName}`;
    }

    // Retorna caminho absoluto normalizado
    return originalPath.replace(/\\/g, '/');
  }

  /**
   * Retorna configurações padrão do OpenShot
   */
  private getDefaultSettings(): Record<string, any> {
    return {
      export_path: '',
      vcodec: 'libx264',
      video_bitrate: 15000000,
      acodec: 'aac',
      audio_bitrate: 192000,
    };
  }
}

export default OpenShotExporter;
