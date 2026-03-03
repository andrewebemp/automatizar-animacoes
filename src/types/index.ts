// Exportações principais - tipos base que não conflitam
export * from './ApiConfig';
export * from './Region';
export * from './Subtitle';

// VideoConfig - usar a versão mais completa do VideoConfig.ts
export {
  type AspectRatio,
  type VideoFormatConfig,
  VIDEO_FORMATS,
  type VideoConfig,
  DEFAULT_VIDEO_CONFIG
} from './VideoConfig';

// VideoSegment - tipos relacionados a segmentos
export * from './VideoSegment';

// ImageScene - exporta ErasedStroke apenas daqui
export {
  type ErasedStroke,
  type ImageScene,
  createEmptyScene,
  createSceneFromImage,
  updateSceneFrames
} from './ImageScene';

// ProjectNew - usa VideoConfig do VideoConfig.ts
// VideoResolution é exportada de ProjectData.ts (versão mais completa)
export {
  type ProjectNew,
  createEmptyProjectNew,
  getProjectDurationFrames,
  getProjectDurationSeconds,
  isProjectReadyForExport
} from './ProjectNew';

// TimelineProject - não exporta ErasedStroke pois já vem de ImageScene
export {
  type SceneElement,
  type TimelineScene,
  type TimelineProject,
  createSceneElement,
  createTimelineScene,
  createEmptyTimelineProject,
  getTimelineProjectDurationFrames,
  msToFrames,
  framesToMs,
  formatTimeMs,
  formatTimeMsShort,
  parseTimeToMs
} from './TimelineProject';

// Element - tipos de elemento básicos
export { type ElementShape, type Element } from './Element';

// ImageBlock - tipos avançados de elemento com timeline
// RevealDirection já é exportado por VideoSegment, então não exportamos daqui
export {
  type RevealPercentage,
  type ElementDisplayMode,
  ELEMENT_DISPLAY_MODE_LABELS,
  REVEAL_DIRECTION_LABELS,
  type ElementRegion,
  type TimelineElement,
  type GridLayout,
  type ElementGridPosition,
  type ImageBlock,
  type ImageBlockConfig,
  DEFAULT_IMAGE_BLOCK_CONFIG,
  calculateRevealDuration,
  calculateRevealEndTime,
  detectRevealDirection
} from './ImageBlock';

// Scene - tipos de cena
export { type Scene } from './Scene';

// ProjectData - tipos de projeto legados e tipos de fluxo
export {
  type ProjectMode,
  type ManualModeSettings,
  DEFAULT_MANUAL_MODE,
  type WizardStep,
  type VideoResolution,
  VIDEO_RESOLUTIONS,
  type RevealStyle,
  DEFAULT_REVEAL_STYLE,
  type ProjectData,
  createEmptyProject
} from './ProjectData';
