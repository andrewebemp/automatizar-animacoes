/**
 * Exportador para formato FCPXML (Final Cut Pro XML)
 * Compatível com DaVinci Resolve via importação de timeline
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
 * Exportador para projetos FCPXML (.fcpxml)
 * Usado por: Final Cut Pro, DaVinci Resolve
 */
export class FCPXMLExporter extends BaseExporter {
  editorId: EditorType = 'davinci';
  name = 'DaVinci Resolve';
  extension = '.fcpxml';
  format = 'FCPXML';

  /**
   * Versão do FCPXML
   */
  private fcpxmlVersion = '1.10';

  /**
   * Exporta o projeto para formato FCPXML
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
      warnings.push('Importe no DaVinci via: File > Import > Timeline');

      if (project.showSubtitles) {
        warnings.push('Legendas não foram incluídas - adicione manualmente');
      }

      // Determina o caminho base para mídias
      const basePath = options.outputPath.replace(/\.[^.]+$/, '');

      // Gera o XML do projeto
      const projectXml = this.generateFCPXML(timeline, basePath, options);

      return {
        success: true,
        projectPath: options.outputPath,
        mediaFolder: options.mediaHandling === 'copy' ? `${basePath}/media` : undefined,
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
   * Gera o documento FCPXML completo
   */
  private generateFCPXML(
    timeline: TimelineData,
    basePath: string,
    options: ExportOptions
  ): string {
    const resources = this.generateResources(timeline, basePath, options);
    const sequence = this.generateSequence(timeline);

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="${this.fcpxmlVersion}">
  ${resources}
  <library location="file://${this.escapeXml(basePath)}/">
    <event name="${this.escapeXml(timeline.name)}">
      <project name="${this.escapeXml(timeline.name)}">
        ${sequence}
      </project>
    </event>
  </library>
</fcpxml>`;
  }

  /**
   * Gera a seção de resources (formatos e assets)
   */
  private generateResources(
    timeline: TimelineData,
    basePath: string,
    options: ExportOptions
  ): string {
    const { width, height, fps } = timeline;

    // Format resource
    let resources = `<resources>
    <format id="r1" name="FFVideoFormat${height}p${fps}" frameDuration="${this.framesToFCPTime(1, fps)}" width="${width}" height="${height}"/>`;

    // Asset resources para cada mídia única
    const addedMedia = new Set<string>();
    let assetId = 2;

    for (const clip of timeline.clips) {
      if (!addedMedia.has(clip.mediaPath)) {
        addedMedia.add(clip.mediaPath);

        const mediaPath = this.getMediaPath(clip.mediaPath, basePath, options);
        const fileName = clip.mediaPath.split(/[/\\]/).pop() || 'media';

        resources += `
    <asset id="r${assetId}" name="${this.escapeXml(fileName)}" src="${this.escapeXml(mediaPath)}" start="0s" duration="${this.framesToFCPTime(timeline.totalFrames, fps)}" hasVideo="1" format="r1">
      <metadata>
        <md key="com.apple.proapps.studio.reel" value="${this.escapeXml(timeline.name)}"/>
      </metadata>
    </asset>`;

        assetId++;
      }
    }

    // Audio asset
    if (timeline.audioTrack) {
      const audioPath = this.getMediaPath(timeline.audioTrack.mediaPath, basePath, options);
      const audioName = timeline.audioTrack.mediaPath.split(/[/\\]/).pop() || 'audio';

      resources += `
    <asset id="r${assetId}" name="${this.escapeXml(audioName)}" src="${this.escapeXml(audioPath)}" start="0s" duration="${this.framesToFCPTime(timeline.audioTrack.endFrame, fps)}" hasAudio="1"/>`;
    }

    resources += '\n  </resources>';

    return resources;
  }

  /**
   * Gera a sequence (timeline)
   */
  private generateSequence(timeline: TimelineData): string {
    const { fps, totalFrames } = timeline;
    const duration = this.framesToFCPTime(totalFrames, fps);

    let sequence = `<sequence format="r1" duration="${duration}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>`;

    // Ordena clips por frame inicial
    const sortedClips = [...timeline.clips].sort((a, b) => a.startFrame - b.startFrame);

    // Mapeia mídia para asset id
    const mediaToAssetId = new Map<string, number>();
    let assetId = 2;
    for (const clip of timeline.clips) {
      if (!mediaToAssetId.has(clip.mediaPath)) {
        mediaToAssetId.set(clip.mediaPath, assetId);
        assetId++;
      }
    }

    // Gera clips
    let currentFrame = 0;

    for (const clip of sortedClips) {
      // Gap se necessário
      if (clip.startFrame > currentFrame) {
        const gapDuration = this.framesToFCPTime(clip.startFrame - currentFrame, fps);
        sequence += `
            <gap name="Gap" offset="${this.framesToFCPTime(currentFrame, fps)}" duration="${gapDuration}"/>`;
      }

      const refId = mediaToAssetId.get(clip.mediaPath) || 2;
      const clipDuration = this.framesToFCPTime(clip.durationFrames, fps);
      const clipOffset = this.framesToFCPTime(clip.startFrame, fps);

      sequence += `
            <asset-clip ref="r${refId}" name="${this.escapeXml(clip.subtitleText || 'Clip')}" offset="${clipOffset}" duration="${clipDuration}" start="0s" tcFormat="NDF">`;

      // Adiciona crop se necessário
      if (clip.crop) {
        const cropParams = this.calculateCropParameters(clip, timeline);
        sequence += `
              <adjust-transform position="${cropParams.posX} ${cropParams.posY}" scale="${cropParams.scale} ${cropParams.scale}"/>`;
      }

      sequence += `
            </asset-clip>`;

      currentFrame = clip.endFrame;
    }

    sequence += `
          </spine>`;

    // Audio track
    if (timeline.audioTrack) {
      const audioDuration = this.framesToFCPTime(timeline.audioTrack.endFrame - timeline.audioTrack.startFrame, fps);
      const audioAssetId = assetId;

      sequence += `
          <audio-role-source role="dialogue">
            <asset-clip ref="r${audioAssetId}" name="Audio" offset="0s" duration="${audioDuration}" start="0s"/>
          </audio-role-source>`;
    }

    sequence += `
        </sequence>`;

    return sequence;
  }

  /**
   * Calcula parâmetros de crop/transform para FCPXML
   */
  private calculateCropParameters(
    clip: TimelineClip,
    timeline: TimelineData
  ): { posX: number; posY: number; scale: number } {
    if (!clip.crop) {
      return { posX: 0, posY: 0, scale: 1 };
    }

    const { x, y, width, height } = clip.crop;

    // Calcula escala para preencher a tela
    const scaleX = timeline.width / width;
    const scaleY = timeline.height / height;
    const scale = Math.min(scaleX, scaleY);

    // Calcula posição para centralizar a região de crop
    // FCPXML usa coordenadas do centro da imagem
    const cropCenterX = x + width / 2;
    const cropCenterY = y + height / 2;
    const imageCenterX = clip.imageWidth / 2;
    const imageCenterY = clip.imageHeight / 2;

    // Offset do centro
    const posX = (imageCenterX - cropCenterX) * scale;
    const posY = (cropCenterY - imageCenterY) * scale; // Y invertido

    return { posX, posY, scale };
  }

  /**
   * Obtém o caminho da mídia formatado para FCPXML
   */
  private getMediaPath(
    originalPath: string,
    basePath: string,
    options: ExportOptions
  ): string {
    if (originalPath.startsWith('data:')) {
      // Data URL será salvo como arquivo
      return `file://${basePath}/media/image.png`;
    }

    if (options.mediaHandling === 'copy') {
      const fileName = originalPath.split(/[/\\]/).pop() || 'media';
      return `file://${basePath}/media/${fileName}`;
    }

    // Referência absoluta
    // Converte backslash para forward slash e adiciona file://
    const normalizedPath = originalPath.replace(/\\/g, '/');
    return `file://${normalizedPath}`;
  }
}

export default FCPXMLExporter;
