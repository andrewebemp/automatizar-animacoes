/**
 * Classe base abstrata para exportadores de projeto
 * Fornece metodos comuns para conversao de dados
 */

import type { ProjectNew } from '../types/ProjectNew';
import type { Subtitle } from '../types/Subtitle';
import type { ImageScene } from '../types/ImageScene';
import type {
  EditorExporter,
  EditorType,
  ExportOptions,
  ExportResult,
  TimelineData,
  TimelineClip,
  AudioTrack,
} from './types';

/**
 * Classe base abstrata para exportadores
 */
export abstract class BaseExporter implements EditorExporter {
  abstract editorId: EditorType;
  abstract name: string;
  abstract extension: string;
  abstract format: string;

  /**
   * Metodo abstrato - cada exportador implementa sua logica de exportacao
   */
  abstract export(project: ProjectNew, options: ExportOptions): Promise<ExportResult>;

  /**
   * Verifica se o projeto pode ser exportado
   */
  canExport(project: ProjectNew): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!project.subtitles || project.subtitles.length === 0) {
      issues.push('Projeto nao tem legendas importadas');
    }

    if (!project.scenes || project.scenes.length === 0) {
      issues.push('Projeto nao tem cenas/imagens');
    }

    // Verifica se todas as cenas tem segmentos com regiao
    for (const scene of project.scenes) {
      if (!scene.segments || scene.segments.length === 0) {
        issues.push(`Cena sem segmentos`);
        continue;
      }

      for (const segment of scene.segments) {
        if (!segment.region) {
          const subtitle = project.subtitles[segment.subtitleIndex];
          const text = subtitle?.text?.substring(0, 30) || `Segmento ${segment.subtitleIndex + 1}`;
          issues.push(`Segmento sem regiao: "${text}..."`);
        }
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Converte o projeto para dados de timeline genericos
   */
  projectToTimeline(project: ProjectNew): TimelineData {
    const { videoConfig, subtitles, scenes, audioUrl, backgroundColor, name } = project;
    const fps = videoConfig.fps;

    // Calcula duracao total
    const lastSubtitle = subtitles[subtitles.length - 1];
    const totalFrames = lastSubtitle ? lastSubtitle.endFrame + fps : fps * 10;

    // Converte cenas/segmentos para clips
    const clips: TimelineClip[] = [];

    for (const scene of scenes) {
      for (const segment of scene.segments) {
        if (!segment.region) continue;

        const subtitle = subtitles[segment.subtitleIndex];
        if (!subtitle) continue;

        const clip: TimelineClip = {
          id: segment.id,
          mediaPath: scene.imageUrl,
          startFrame: subtitle.startFrame,
          endFrame: subtitle.endFrame,
          durationFrames: subtitle.endFrame - subtitle.startFrame,
          imageWidth: scene.imageWidth,
          imageHeight: scene.imageHeight,
          subtitleText: subtitle.text,
          displayMode: segment.displayMode,
          revealDirection: segment.revealDirection,
          revealFraction: segment.revealFraction,
        };

        // Se tem regiao com bounds, adiciona crop
        if (segment.region.bounds) {
          clip.crop = {
            x: segment.region.bounds.x,
            y: segment.region.bounds.y,
            width: segment.region.bounds.width,
            height: segment.region.bounds.height,
          };
        }

        clips.push(clip);
      }
    }

    // Ordena clips por frame inicial
    clips.sort((a, b) => a.startFrame - b.startFrame);

    // Audio track
    let audioTrack: AudioTrack | undefined;
    if (audioUrl) {
      audioTrack = {
        id: 'audio-main',
        mediaPath: audioUrl,
        startFrame: 0,
        endFrame: totalFrames,
      };
    }

    return {
      name: name || 'Projeto',
      width: videoConfig.width,
      height: videoConfig.height,
      fps,
      totalFrames,
      clips,
      audioTrack,
      backgroundColor,
    };
  }

  /**
   * Converte frames para segundos
   */
  protected framesToSeconds(frames: number, fps: number): number {
    return frames / fps;
  }

  /**
   * Converte frames para formato de tempo (HH:MM:SS.mmm)
   */
  protected framesToTimecode(frames: number, fps: number): string {
    const totalSeconds = frames / fps;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.round((totalSeconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Converte frames para formato de tempo FCPXML (XXs ou XX/XXs)
   */
  protected framesToFCPTime(frames: number, fps: number): string {
    // FCPXML usa formato "frames/fps" ou "segundos/1s"
    return `${frames}/${fps}s`;
  }

  /**
   * Gera um ID unico
   */
  protected generateId(prefix: string = 'id'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Escapa caracteres especiais para XML
   */
  protected escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Converte cor hex para formato RGB
   */
  protected hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }

  /**
   * Converte data URL para caminho de arquivo (placeholder)
   * Em ambiente real, isso salvaria o arquivo e retornaria o caminho
   */
  protected dataUrlToPath(dataUrl: string, baseName: string): string {
    // Se ja e um caminho de arquivo, retorna como esta
    if (!dataUrl.startsWith('data:')) {
      return dataUrl;
    }

    // Placeholder - sera substituido pelo caminho real apos salvar
    return `media/${baseName}`;
  }
}

export default BaseExporter;
