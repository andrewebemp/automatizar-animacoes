/**
 * Re-exporta todos os exportadores e tipos
 */

// Tipos
export type {
  MediaHandling,
  ExportOptions,
  ExportResult,
  TimelineClip,
  AudioTrack,
  TimelineData,
  EditorType,
  EditorInfo,
  EditorExporter,
} from './types';

export { SUPPORTED_EDITORS } from './types';

// Base
export { BaseExporter } from './BaseExporter';

// Exportadores MLT (Kdenlive, Shotcut)
export { KdenliveExporter } from './mlt/KdenliveExporter';

// Exportadores FCPXML (Final Cut Pro, DaVinci Resolve)
export { FCPXMLExporter } from './fcpxml/FCPXMLExporter';

// Exportadores JSON (OpenShot, CapCut)
export { OpenShotExporter } from './json/OpenShotExporter';

/**
 * Mapa de exportadores por ID do editor
 */
import { KdenliveExporter } from './mlt/KdenliveExporter';
import { FCPXMLExporter } from './fcpxml/FCPXMLExporter';
import { OpenShotExporter } from './json/OpenShotExporter';
import type { EditorType, EditorExporter } from './types';

export function getExporter(editorId: EditorType): EditorExporter {
  switch (editorId) {
    case 'kdenlive':
      return new KdenliveExporter();
    case 'davinci':
      return new FCPXMLExporter();
    case 'openshot':
      return new OpenShotExporter();
    default:
      throw new Error(`Exportador não encontrado para: ${editorId}`);
  }
}
